const setupState = {
  configured: false,
  planId: "",
  status: "not_configured",
  startedAt: "",
  renewsAt: "",
};

export async function getSubscriptionStatus() {
  return { ...setupState };
}

export async function startCheckout(planId) {
  if (!planId) throw new Error("Select a plan before continuing.");
  throw new Error("Checkout is not configured yet. Connect a payment provider before accepting subscriptions.");
}
