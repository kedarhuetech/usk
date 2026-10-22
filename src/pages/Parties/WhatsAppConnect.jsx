import { useEffect, useState } from "react";
import { FiCheckCircle, FiMessageCircle, FiShield, FiSmartphone } from "react-icons/fi";
import Card from "../../components/Common/Card";

const slides = [
  {
    title: "WhatsApp as Usual",
    text: "Keep using WhatsApp's core features while sharing invoices with business contacts.",
    icon: FiMessageCircle,
  },
  {
    title: "Smart Invoice Sharing",
    text: "Send clean transaction updates from one connected business workspace.",
    icon: FiCheckCircle,
  },
  {
    title: "Secure Business Pairing",
    text: "Pair your phone once and keep every customer conversation organized.",
    icon: FiShield,
  },
];

const steps = [
  "Install WhatsApp Business.",
  "Scan the QR code.",
  "Complete pairing and start sending invoices.",
];

function DemoIllustration({ slide }) {
  const Icon = slide.icon;

  return (
    <div className="relative mx-auto h-72 max-w-xl">
      <div className="absolute inset-x-6 top-8 rounded-xl border border-slate-200 bg-white p-4 shadow-xl shadow-slate-200/70">
        <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="h-3 w-40 rounded-full bg-slate-200" />
          <div className="flex gap-2">
            <span className="h-6 w-16 rounded-full bg-rose-100" />
            <span className="h-6 w-16 rounded-full bg-blue-100" />
          </div>
        </div>
        <div className="grid grid-cols-[150px_1fr] gap-4">
          <div className="space-y-3">
            {[1, 2, 3, 4].map((item) => (
              <div key={item} className="flex items-center gap-2 rounded-lg bg-slate-50 p-2">
                <span className="h-8 w-8 rounded-full bg-slate-200" />
                <span className="h-2 flex-1 rounded-full bg-slate-200" />
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-emerald-50 p-4">
            <div className="mb-4 inline-flex rounded-lg bg-white px-4 py-3 text-sm text-slate-700 shadow-sm">
              Can you send my last invoice?
            </div>
            <div className="ml-auto h-20 w-40 rounded-lg border border-emerald-100 bg-white p-3 shadow-sm">
              <div className="h-2 w-20 rounded bg-indigo-300" />
              <div className="mt-3 space-y-2">
                <div className="h-2 rounded bg-slate-200" />
                <div className="h-2 w-3/4 rounded bg-slate-200" />
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="absolute bottom-2 left-10 w-40 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl">
        <div className="mb-3 flex items-center gap-2">
          <FiSmartphone className="text-emerald-600" />
          <span className="h-2 flex-1 rounded bg-slate-200" />
        </div>
        <div className="rounded-lg bg-emerald-50 p-3 text-xs text-slate-700">Invoice sent</div>
      </div>
      <div className="absolute right-8 top-2 flex h-16 w-16 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg">
        <Icon className="h-8 w-8" />
      </div>
    </div>
  );
}

function QrPlaceholder({ enabled }) {
  return (
    <div
      className={`relative mx-auto grid h-72 w-72 grid-cols-12 gap-1 rounded-lg border border-slate-200 bg-white p-4 transition duration-300 ease-in-out ${
        enabled ? "blur-0" : "blur-sm"
      }`}
    >
      {Array.from({ length: 144 }).map((_, index) => (
        <span
          key={index}
          className={(index * 7 + index) % 5 < 2 ? "rounded-[1px] bg-slate-950" : "rounded-[1px] bg-white"}
        />
      ))}
      <span className="absolute left-6 top-6 h-14 w-14 border-[10px] border-slate-950 bg-white" />
      <span className="absolute right-6 top-6 h-14 w-14 border-[10px] border-slate-950 bg-white" />
      <span className="absolute bottom-6 left-6 h-14 w-14 border-[10px] border-slate-950 bg-white" />
      <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-emerald-600 shadow-sm">
        <FiMessageCircle className="h-8 w-8" />
      </span>
    </div>
  );
}

function WhatsAppConnect() {
  const [activeSlide, setActiveSlide] = useState(0);
  const [qrEnabled, setQrEnabled] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setActiveSlide((current) => (current + 1) % slides.length);
    }, 3000);

    return () => clearInterval(timer);
  }, []);

  const slide = slides[activeSlide];

  return (
    <div className="bg-slate-200 p-1">
      <div className="mb-1 bg-white px-6 py-5">
        <h1 className="text-xl font-bold text-slate-800">WhatsApp Connect</h1>
      </div>

      <div className="grid min-h-[calc(100vh-11rem)] gap-1 lg:grid-cols-[3fr_2fr]">
        <section className="flex items-center justify-center bg-blue-50 p-6">
          <div className="w-full max-w-3xl text-center">
            <div className="relative min-h-[460px]">
              {slides.map((item, index) => (
                <div
                  key={item.title}
                  className={`absolute inset-0 transition-opacity duration-300 ease-in-out ${
                    index === activeSlide ? "opacity-100" : "pointer-events-none opacity-0"
                  }`}
                >
                  <DemoIllustration slide={item} />
                  <h2 className="mt-8 text-xl font-bold text-slate-800">{item.title}</h2>
                  <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-500">{item.text}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-center gap-2">
              {slides.map((item, index) => (
                <button
                  key={item.title}
                  type="button"
                  onClick={() => setActiveSlide(index)}
                  className={`h-2.5 w-2.5 rounded-full transition ${index === activeSlide ? "bg-blue-600" : "bg-slate-300"}`}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center bg-white p-6">
          <Card className="w-full max-w-lg border-0 p-8 shadow-sm">
            <h2 className="text-center text-xl font-bold text-slate-800">Scan this QR Code</h2>
            <div className="mt-7">
              <QrPlaceholder enabled={qrEnabled} />
            </div>

            <label className="mt-6 flex items-start gap-3 rounded-lg bg-slate-50 p-4 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={qrEnabled}
                onChange={(event) => setQrEnabled(event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-blue-600"
              />
              I have installed WhatsApp Business on my mobile.
            </label>

            <div className="mt-7 space-y-5">
              {steps.map((step, index) => (
                <div key={step} className="flex gap-4 text-sm text-slate-700">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white font-semibold text-slate-600">
                    {index + 1}
                  </span>
                  <p className="pt-1">{step}</p>
                </div>
              ))}
            </div>

            <p className="mt-8 rounded-lg bg-emerald-50 px-4 py-3 text-center text-xs font-medium text-emerald-700">
              Secure connection. Your QR is enabled only after confirmation.
            </p>
          </Card>
        </section>
      </div>
    </div>
  );
}

export default WhatsAppConnect;
