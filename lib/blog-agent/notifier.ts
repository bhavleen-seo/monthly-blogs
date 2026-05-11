/**
 * Slack notifier — sends messages to a Slack incoming webhook.
 * Set SLACK_WEBHOOK_URL in environment to enable.
 * If unset, all notification calls become silent no-ops.
 */

type Severity = "info" | "success" | "warning" | "error";

const COLOR: Record<Severity, string> = {
  info: "#3b82f6",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
};

const EMOJI: Record<Severity, string> = {
  info: ":information_source:",
  success: ":white_check_mark:",
  warning: ":warning:",
  error: ":x:",
};

async function send(
  severity: Severity,
  title: string,
  message: string,
  fields?: Array<{ name: string; value: string }>
): Promise<void> {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return;

  const payload = {
    attachments: [
      {
        color: COLOR[severity],
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `${EMOJI[severity]} *${title}*\n${message}`,
            },
          },
          ...(fields && fields.length > 0
            ? [
                {
                  type: "section",
                  fields: fields.map((f) => ({
                    type: "mrkdwn",
                    text: `*${f.name}:*\n${f.value}`,
                  })),
                },
              ]
            : []),
        ],
      },
    ],
  };

  try {
    await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    // Never let notification failures break the agent
    console.error("Slack notification failed:", err);
  }
}

export const notify = {
  topicsReadyForApproval: (clientName: string, count: number) =>
    send(
      "info",
      "Topics ready for approval",
      `${count} new topic${count === 1 ? "" : "s"} for *${clientName}* awaiting review.`
    ),

  /** Day-1 summary: one Slack message after research finishes for all clients. */
  researchCompleteSummary: (clientCount: number, totalTopics: number) =>
    send(
      "info",
      "Topic research complete",
      `Generated *${totalTopics}* topic${totalTopics === 1 ? "" : "s"} across *${clientCount}* client${clientCount === 1 ? "" : "s"}. Open the dashboard to approve one topic per client. Writing kicks off on the 10th.`
    ),

  /** Day-8 reminder: pings only if any clients still have zero approved topics. */
  topicsPendingReminder: (pendingClients: string[]) =>
    send(
      "warning",
      "Topics still need approval",
      `${pendingClients.length} client${pendingClients.length === 1 ? " has" : "s have"} no approved topic yet. Writing starts on the 10th — please review:\n${pendingClients
        .slice(0, 30)
        .map((n) => `• ${n}`)
        .join("\n")}${pendingClients.length > 30 ? `\n…and ${pendingClients.length - 30} more.` : ""}`
    ),

  /** Day-10+ sweep: one summary after each daily write sweep. */
  writingSweepSummary: (
    writtenCount: number,
    stillPendingClients: string[],
    isFinalDay: boolean
  ) => {
    const lines: string[] = [];
    if (writtenCount > 0) {
      lines.push(`Wrote *${writtenCount}* new post${writtenCount === 1 ? "" : "s"} from approved topics.`);
    } else {
      lines.push(`No new posts written in this sweep.`);
    }
    if (stillPendingClients.length > 0 && !isFinalDay) {
      lines.push(
        `\n${stillPendingClients.length} client${stillPendingClients.length === 1 ? " is" : "s are"} still waiting on your approval:\n${stillPendingClients
          .slice(0, 30)
          .map((n) => `• ${n}`)
          .join("\n")}${stillPendingClients.length > 30 ? `\n…and ${stillPendingClients.length - 30} more.` : ""}`
      );
    }
    return send(
      stillPendingClients.length > 0 ? "warning" : "success",
      "Writing sweep complete",
      lines.join("\n")
    );
  },

  /** Day-20 closure: clients that never got an approved topic this cycle. */
  clientsSkippedForMonth: (skippedClients: string[]) =>
    send(
      "warning",
      "Clients skipped this month",
      `Approval window has closed. These client${skippedClients.length === 1 ? "" : "s"} did not get a post this cycle (no topic approved in time):\n${skippedClients
        .slice(0, 30)
        .map((n) => `• ${n}`)
        .join("\n")}${skippedClients.length > 30 ? `\n…and ${skippedClients.length - 30} more.` : ""}`
    ),

  postsWritten: (count: number, totalApproved: number) =>
    send(
      "info",
      "Posts written",
      `Wrote ${count} of ${totalApproved} approved post${totalApproved === 1 ? "" : "s"}. Review them in the dashboard.`
    ),

  postPublished: (clientName: string, title: string, url: string) =>
    send(
      "success",
      "Post published",
      `*${clientName}*: <${url}|${title}>`
    ),

  publishFailed: (clientName: string, title: string, error: string) =>
    send(
      "error",
      "Publish failed",
      `*${clientName}*: ${title}`,
      [{ name: "Error", value: error.slice(0, 500) }]
    ),

  publishSummary: (success: number, failed: number) =>
    send(
      failed > 0 ? "warning" : "success",
      "Publish run complete",
      `${success} succeeded, ${failed} failed.`
    ),
};
