import { v4 as uuidv4 } from "uuid";
import type { Client, TopicSuggestion, BlogPost, AgentRun } from "./types";
import {
  getClients,
  getClient,
  getTopics,
  saveTopic,
  savePost,
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

    let totalTopics = 0;

    for (const client of clients) {
      try {
        const topics = await researchTopics(client, month);
        topicsByClient[client.id] = topics;

        for (const topic of topics) {
          await saveTopic(topic);
        }

        totalTopics += topics.length;
        if (topics.length > 0) {
          await notify.topicsReadyForApproval(client.businessName, topics.length);
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

    await updateRun(run.id, {
      status: "completed",
      message: `Generated ${totalTopics} topic suggestions for ${clients.length} client(s)`,
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

export async function runWriting(clientId?: string): Promise<{
  run: AgentRun;
  posts: BlogPost[];
}> {
  const run: AgentRun = {
    id: uuidv4(),
    type: "write",
    clientId,
    status: "running",
    message: "Writing blog posts from approved topics...",
    startedAt: new Date().toISOString(),
  };
  await addRun(run);

  const posts: BlogPost[] = [];

  try {
    const approvedTopics = await getTopics({
      clientId,
      status: "approved",
    });

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
        if (!client) continue;

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

export async function runPublishing(clientId?: string): Promise<{
  run: AgentRun;
  results: Array<{ postId: string; success: boolean; url?: string; error?: string }>;
}> {
  const run: AgentRun = {
    id: uuidv4(),
    type: "publish",
    clientId,
    status: "running",
    message: "Publishing blog posts to WordPress...",
    startedAt: new Date().toISOString(),
  };
  await addRun(run);

  const results: Array<{ postId: string; success: boolean; url?: string; error?: string }> = [];

  try {
    const readyPosts = await getPostsFromStore({ clientId, status: "ready" });

    if (readyPosts.length === 0) {
      await updateRun(run.id, {
        status: "completed",
        message: "No posts ready for publishing",
        completedAt: new Date().toISOString(),
      });
      return { run, results };
    }

    for (const post of readyPosts) {
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
