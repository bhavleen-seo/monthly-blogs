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
