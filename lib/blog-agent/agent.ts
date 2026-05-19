import { v4 as uuidv4 } from "uuid";
import type { Client, TopicSuggestion, BlogPost, AgentRun } from "./types";
import {
  getClients,
  getClient,
  getTopics,
  saveTopic,
  deleteTopic,
  savePost,
  getPost,
  getPosts as getPostsFromStore,
  addRun,
  updateRun,
} from "./store";
import { researchTopics } from "./researcher";
import { writeBlogPost } from "./writer";
import { publishToWordPress } from "./publisher";
import { notify } from "./notifier";

export async function runResearch(clientId?: string): Promise<{
  run: AgentRun;
  topicsByClient: Record<string, TopicSuggestion[]>;
}> {
  const run: AgentRun = {
    id: uuidv4(),
    type: "research",
    clientId,
    status: "running",
    message: "Researching blog topics...",
    startedAt: new Date().toISOString(),
  };
  await addRun(run);

  const topicsByClient: Record<string, TopicSuggestion[]> = {};
  const now = new Date();
  const targetMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const month = `${targetMonth.getFullYear()}-${String(targetMonth.getMonth() + 1).padStart(2, "0")}`;

  try {
    let clients: Client[];
    if (clientId) {
      const client = await getClient(clientId);
      clients = client ? [client] : [];
    } else {
      clients = (await getClients()).filter((c) => c.isActive);
    }

    if (clients.length === 0) {
      await updateRun(run.id, {
        status: "completed",
        message: "No active clients found",
        completedAt: new Date().toISOString(),
      });
      return { run, topicsByClient };
    }

    // Delete all pending (unapproved) topics from any previous month.
    // Approved topics are kept regardless of age.
    const allPending = await getTopics({ status: "pending" });
    const staleTopics = allPending.filter((t) => t.month < month);
    for (const t of staleTopics) await deleteTopic(t.id);
    if (staleTopics.length > 0) {
      console.log(`[runResearch] Cleaned up ${staleTopics.length} stale pending topics from previous months`);
    }

    let totalTopics = 0;
    let skippedCount = 0;

    for (const client of clients) {
      try {
        // Skip clients that already have PENDING topics for this month.
        // Approved/rejected topics don't count — clients with only approved
        // topics still need fresh pending suggestions for the next pick.
        const existingPending = await getTopics({ clientId: client.id, month, status: "pending" });
        if (existingPending.length > 0) {
          console.log(`[runResearch] Skipping ${client.businessName} — already has ${existingPending.length} pending topics for ${month}`);
          topicsByClient[client.id] = existingPending;
          skippedCount++;
          continue;
        }

        const topics = await researchTopics(client, month);
        topicsByClient[client.id] = topics;

        for (const topic of topics) {
          await saveTopic(topic);
        }

        totalTopics += topics.length;
        if (topics.length > 0) {
          // Only ping per-client when this is a manual single-client run.
          // Batch runs (cron or "research all") get one consolidated Slack
          // summary from the caller — avoids spamming 24 messages at once.
          if (clientId) {
            await notify.topicsReadyForApproval(client.businessName, topics.length);
          }
        } else {
          const msg = `No topics generated for ${client.businessName} (model returned no valid JSON).`;
          run.details = run.details ? `${run.details}\n${msg}` : msg;
          await updateRun(run.id, { details: run.details });
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        topicsByClient[client.id] = [];
        const detail = `Error for ${client.businessName}: ${errMsg}`;
        run.details = run.details ? `${run.details}\n${detail}` : detail;
        console.error("[runResearch]", detail);
        await updateRun(run.id, { details: run.details });
      }
    }

    const researched = clients.length - skippedCount;
    await updateRun(run.id, {
      status: "completed",
      message: `Generated ${totalTopics} topic suggestions for ${researched} client(s)${skippedCount > 0 ? ` (${skippedCount} skipped — already researched this month)` : ""}`,
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    await updateRun(run.id, {
      status: "failed",
      message: `Research failed: ${errMsg}`,
      completedAt: new Date().toISOString(),
    });
  }

  return { run, topicsByClient };
}

export async function runWriting(
  clientId?: string,
  topicIds?: string[]
): Promise<{
  run: AgentRun;
  posts: BlogPost[];
}> {
  const run: AgentRun = {
    id: uuidv4(),
    type: "write",
    clientId,
    status: "running",
    message: topicIds?.length
      ? `Writing ${topicIds.length} selected blog post(s)...`
      : "Writing blog posts from approved topics...",
    startedAt: new Date().toISOString(),
  };
  await addRun(run);

  const posts: BlogPost[] = [];

  try {
    let approvedTopics = await getTopics({
      clientId,
      status: "approved",
    });

    // If a specific selection was provided, narrow to just those.
    if (topicIds && topicIds.length > 0) {
      const idSet = new Set(topicIds);
      approvedTopics = approvedTopics.filter((t) => idSet.has(t.id));
    }

    if (approvedTopics.length === 0) {
      await updateRun(run.id, {
        status: "completed",
        message: "No approved topics to write",
        completedAt: new Date().toISOString(),
      });
      return { run, posts };
    }

    for (const topic of approvedTopics) {
      try {
        const client = await getClient(topic.clientId);
        if (!client) {
          const detail = `Skipped "${topic.title}" — client ID ${topic.clientId} not found. The client may have been deleted and re-added. Re-research topics for this client to fix.`;
          run.details = run.details ? `${run.details}\n${detail}` : detail;
          await updateRun(run.id, { details: run.details });
          continue;
        }

        const post = await writeBlogPost(client, topic);
        await savePost(post);
        posts.push(post);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        await updateRun(run.id, {
          details: `Error writing "${topic.title}": ${errMsg}`,
        });
      }
    }

    // Auto-reject any approved topics that weren't part of this writing run.
    // This keeps the queue clean — next time writing runs, only freshly-approved
    // topics are present, not old leftovers from previous months.
    if (posts.length > 0) {
      const writtenTopicIds = new Set(approvedTopics.map((t) => t.id));
      const affectedClientIds = [...new Set(approvedTopics.map((t) => t.clientId))];
      for (const cid of affectedClientIds) {
        const allApproved = await getTopics({ clientId: cid, status: "approved" });
        for (const t of allApproved) {
          if (!writtenTopicIds.has(t.id)) {
            await saveTopic({ ...t, status: "rejected" });
          }
        }
      }
    }

    await updateRun(run.id, {
      status: "completed",
      message: `Wrote ${posts.length} blog post(s) from ${approvedTopics.length} approved topic(s)`,
      completedAt: new Date().toISOString(),
    });
    if (posts.length > 0) {
      await notify.postsWritten(posts.length, approvedTopics.length);
    }
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    await updateRun(run.id, {
      status: "failed",
      message: `Writing failed: ${errMsg}`,
      completedAt: new Date().toISOString(),
    });
  }

  return { run, posts };
}

export async function runPublishing(
  clientId?: string,
  postId?: string
): Promise<{
  run: AgentRun;
  results: Array<{ postId: string; success: boolean; url?: string; error?: string }>;
}> {
  const run: AgentRun = {
    id: uuidv4(),
    type: "publish",
    clientId,
    status: "running",
    message: postId
      ? "Publishing single post to WordPress..."
      : "Publishing blog posts to WordPress...",
    startedAt: new Date().toISOString(),
  };
  await addRun(run);

  const results: Array<{ postId: string; success: boolean; url?: string; error?: string }> = [];

  try {
    // Single-post retry path: fetch that specific post regardless of status so
    // failed or ghost-published (status=published with no publishedUrl) posts
    // can be retried from the UI.
    let postsToPublish: BlogPost[];
    if (postId) {
      const one = await getPost(postId);
      if (!one) {
        await updateRun(run.id, {
          status: "failed",
          message: `Post ${postId} not found`,
          completedAt: new Date().toISOString(),
        });
        return { run, results };
      }
      postsToPublish = [one];
    } else {
      postsToPublish = await getPostsFromStore({ clientId, status: "ready" });
    }

    if (postsToPublish.length === 0) {
      await updateRun(run.id, {
        status: "completed",
        message: "No posts ready for publishing",
        completedAt: new Date().toISOString(),
      });
      return { run, results };
    }

    for (const post of postsToPublish) {
      try {
        const client = await getClient(post.clientId);
        if (!client) {
          results.push({ postId: post.id, success: false, error: "Client not found" });
          continue;
        }

        const result = await publishToWordPress(client, post);
        post.wordpressPostId = result.wordpressPostId;
        post.publishedUrl = result.publishedUrl;
        post.publishedAt = new Date().toISOString();
        post.status = "published";
        post.updatedAt = new Date().toISOString();
        await savePost(post);

        results.push({ postId: post.id, success: true, url: result.publishedUrl });
        await notify.postPublished(client.businessName, post.title, result.publishedUrl);
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        post.status = "failed";
        post.updatedAt = new Date().toISOString();
        await savePost(post);
        results.push({ postId: post.id, success: false, error: errMsg });
        const client = await getClient(post.clientId);
        await notify.publishFailed(client?.businessName || "Unknown client", post.title, errMsg);
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const failCount = results.length - successCount;
    await updateRun(run.id, {
      status: "completed",
      message: `Published ${successCount}/${results.length} post(s) successfully`,
      completedAt: new Date().toISOString(),
    });
    await notify.publishSummary(successCount, failCount);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : "Unknown error";
    await updateRun(run.id, {
      status: "failed",
      message: `Publishing failed: ${errMsg}`,
      completedAt: new Date().toISOString(),
    });
  }

  return { run, results };
}
