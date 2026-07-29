export function shouldValidateMediaForDraftDelivery(input: {
  autoPilot: boolean
  forcePublish?: boolean
  accountHandle?: string | null
}) {
  return (input.autoPilot || !!input.forcePublish) &&
    input.accountHandle !== 'unconfigured'
}
