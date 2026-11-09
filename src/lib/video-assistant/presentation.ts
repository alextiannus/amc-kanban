const messages: Record<string, string> = {
  post_revision_conflict:
    "发布内容、素材或排期已变化，请返回原对话读取最新版并重新确认。",
  post_account_unavailable: "目标账号当前不可发布，请先检查账号连接。",
  post_creative_revision_conflict: "来源脚本已更新，请先核对当前创意版本。",
  post_schedule_unavailable: "暂时无法确定可用排期，请保留草稿并稍后重试。",
  post_not_submittable: "这条草稿已有投递记录或需要处理，请先核对原发布结果。",
  post_source_draft_mismatch: "创意已关联另一条发布草稿，请使用原草稿接续。",
  video_revision_conflict:
    "制作内容已更新，请返回原对话读取最新版本并重新确认。",
  video_confirmation_expired: "这次确认已过期，请返回原对话重新核对制作费用。",
  video_confirmation_not_found:
    "找不到这条确认记录，请使用原对话中的入口，并登录同一账号。",
  video_final_review_required: "请先观看并确认当前成片，再下载视频。",
  video_pricing_unavailable: "当前制作费用尚未确认，请稍后重新估价。",
  video_credit_estimate_unavailable:
    "当前 AMC Credit 用量尚未确认，请先更新制作服务的费用回执。",
  video_not_ready: "视频还未完成合成，请返回原对话查看进度。",
  video_output_unavailable: "当前视频暂不可用，请返回原对话核对制作结果。",
  video_not_found: "找不到这条视频，请确认品牌和登录账号。",
  video_request_key_conflict:
    "这条请求与已有记录不一致，请返回原对话核对，避免重复制作。",
};
export function videoAssistantMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  return (
    messages[message] ||
    (/Permission denied|Brand access denied|Actor is inactive|Identity revoked/.test(
      message,
    )
      ? "当前账号或品牌授权已变更，请重新登录或联系主理人。"
      : /[\u3400-\u9fff]/.test(message)
        ? message
        : "视频服务暂不可用，请保留原任务并稍后重试。")
  );
}
