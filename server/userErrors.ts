export function isOpenAIQuotaOrRateLimit(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("openai") &&
    (normalized.includes("quota") ||
      normalized.includes("rate limit") ||
      normalized.includes("billing") ||
      normalized.includes("project limits") ||
      normalized.includes("insufficient_quota"))
  );
}

function isAnthropicQuotaOrRateLimit(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("anthropic") &&
    (normalized.includes("credit balance is too low") ||
      normalized.includes("quota") ||
      normalized.includes("rate limit") ||
      normalized.includes("billing"))
  );
}

function isGenericProviderQuotaOrRateLimit(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("credit balance is too low") ||
    normalized.includes("insufficient_quota") ||
    normalized.includes("current quota") ||
    normalized.includes("project limits")
  );
}

export function toUserFacingError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error || "");

  if (isAnthropicQuotaOrRateLimit(message)) {
    return "Claude / Anthropic API 余额暂时不足，请到 Anthropic 控制台充值或切换模型后再试。本次不会扣除 credits。";
  }

  if (isOpenAIQuotaOrRateLimit(message)) {
    return "OpenAI API 额度暂时不足，请到 OpenAI Platform 补充余额或检查项目限制后再试。本次不会扣除 credits。";
  }

  if (isGenericProviderQuotaOrRateLimit(message)) {
    return "AI 供应商额度暂时不足，请检查当前模型对应平台的余额或项目限制后再试。本次不会扣除 credits。";
  }

  if (message.includes("All OpenAI model candidates failed")) {
    return "AI 生成服务暂时不可用，请稍后重新生成。本次不会扣除 credits。";
  }

  return message || "生成失败，请稍后重试。";
}
