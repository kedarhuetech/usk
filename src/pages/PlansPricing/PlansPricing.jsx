import { useEffect, useState } from "react";
import {
  FiCheck,
  FiClock,
  FiCreditCard,
  FiInfo,
  FiLock,
  FiStar,
  FiX,
} from "react-icons/fi";
import Button from "../../components/Common/Button";
import Card from "../../components/Common/Card";
import { comparisonFeatures, plans } from "../../constants/plansPricingData";
import { getSubscriptionStatus, startCheckout } from "../../services/subscriptionService";

function FeatureIcon({ status }) {
  if (status === "included" || status === "Available") {
    return <FiCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" />;
  }
  if (status === "Not included") {
    return <FiX className="h-4 w-4 text-slate-400" aria-hidden="true" />;
  }
  return <FiClock className="h-4 w-4 text-amber-600" aria-hidden="true" />;
}

function PlanCard({ plan, onChoose, isSelected, message }) {
  return (
    <Card className={`relative flex h-full flex-col p-5 ${isSelected ? "border-[#343B9A] ring-2 ring-indigo-100" : plan.recommended ? "border-[#343B9A] shadow-md" : ""}`}>
      {plan.recommended && (
        <span className="absolute right-4 top-4 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-[#343B9A]">
          <FiStar className="h-3.5 w-3.5" /> Recommended
        </span>
      )}
      <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
      <p className="mt-2 min-h-10 text-sm leading-5 text-slate-500">{plan.description}</p>
      <p className="mt-5 text-xl font-bold text-slate-900">{plan.price}</p>
      <p className="mt-1 text-xs text-slate-500">{plan.billingPeriod}</p>
      <Button
        onClick={() => onChoose(plan)}
        className={`mt-5 w-full ${isSelected ? "bg-[#1A1F71] text-white hover:bg-[#14185D]" : "border border-slate-300 text-slate-700 hover:bg-slate-50"}`}
      >
        {isSelected ? "Plan Selected" : "Choose Plan"}
      </Button>
      {message && (
        <p role="status" className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-800">
          {message}
        </p>
      )}
      <ul className="mt-6 space-y-3 border-t border-slate-100 pt-5">
        {plan.features.map((feature) => (
          <li key={feature.label} className="flex items-start gap-2 text-sm text-slate-600">
            <FeatureIcon status={feature.status} />
            <span>
              {feature.label}
              {feature.status === "planned" && <span className="ml-1 text-xs text-amber-700">(planned)</span>}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PlansPricing() {
  const [subscription, setSubscription] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedPlanMessage, setSelectedPlanMessage] = useState("");

  useEffect(() => {
    let active = true;
    getSubscriptionStatus()
      .then((status) => {
        if (active) setSubscription(status);
      })
      .catch((error) => {
        if (active) setNotice({ type: "error", message: error.message });
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleChoosePlan = async (plan) => {
    setSelectedPlanId(plan.id);
    setSelectedPlanMessage("Checking checkout availability...");
    setNotice(null);
    try {
      await startCheckout(plan.id);
    } catch (error) {
      setSelectedPlanMessage(error.message);
      setNotice({ type: "info", message: `${plan.name}: ${error.message}` });
    }
  };

  return (
    <div className="min-h-full bg-slate-100 p-4 sm:p-5">
      <div className="mx-auto max-w-7xl space-y-5">
        <section className="rounded-xl bg-gradient-to-r from-[#1A1F71] to-[#343B9A] p-5 text-white sm:p-7">
          <p className="text-sm text-white/70">Your plans</p>
          <div className="mt-1">
            <div>
              <h1 className="text-2xl font-bold">Plans &amp; Pricing</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/75">
                Choose a plan that fits your business. Commercial pricing and checkout will be connected when the subscription service is configured.
              </p>
            </div>
          </div>
        </section>

        {notice && (
          <div
            role="status"
            className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${notice.type === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}
          >
            <FiInfo className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{notice.message}</span>
          </div>
        )}

        <Card className="p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-700">
              <FiLock className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-slate-800">Subscription setup</h2>
              {isLoading ? (
                <p className="mt-1 text-sm text-slate-500">Checking subscription status...</p>
              ) : subscription?.configured ? (
                <p className="mt-1 text-sm text-slate-500">Current plan: {subscription.planId || "Not selected"}</p>
              ) : (
                <p className="mt-1 text-sm text-slate-500">
                  No active subscription is connected yet. Plan selection is available for review, but checkout is not enabled.
                </p>
              )}
            </div>
          </div>
        </Card>

        <section>
          <div className="mb-3">
            <h2 className="text-lg font-bold text-slate-800">Choose a plan</h2>
            <p className="mt-1 text-sm text-slate-500">The plan details below are configurable placeholders, not confirmed commercial pricing.</p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onChoose={handleChoosePlan}
                isSelected={selectedPlanId === plan.id}
                message={selectedPlanId === plan.id ? selectedPlanMessage : ""}
              />
            ))}
          </div>
        </section>

        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 p-5">
            <h2 className="text-lg font-bold text-slate-800">Feature comparison</h2>
            <p className="mt-1 text-sm text-slate-500">Planned capabilities are clearly marked until subscription entitlements are implemented.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
                <tr>
                  <th className="px-5 py-3">Feature</th>
                  <th className="px-5 py-3">Basic</th>
                  <th className="px-5 py-3">Professional</th>
                  <th className="px-5 py-3">Business</th>
                </tr>
              </thead>
              <tbody>
                {comparisonFeatures.map((feature) => (
                  <tr key={feature.label} className="border-t border-slate-100">
                    <th className="px-5 py-3 font-medium text-slate-700">{feature.label}</th>
                    {[feature.basic, feature.professional, feature.business].map((value) => (
                      <td key={`${feature.label}-${value}`} className="px-5 py-3 text-slate-600">
                        <span className="inline-flex items-center gap-2">
                          <FeatureIcon status={value} />
                          {value}
                        </span>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
              <FiCreditCard className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold text-slate-800">Payment integration</h2>
              <p className="mt-1 text-sm leading-6 text-slate-500">
                No payment provider is connected. Selecting a plan will not charge the user or activate a subscription. A future gateway must verify payments on the backend before changing subscription status.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

export default PlansPricing;
