/**
 * Business Register & Login Portal (Charcoal & Orange Theme)
 * 
 * Features:
 * 1. Seamless tab toggle between Login and Multi-Step Business Registration.
 * 2. Stage 1: Email OTP Verification via Nodemailer.
 * 3. Stage 2: Unique Business / Tenant ID picker with live availability check.
 * 4. Password security with confirmation check and bcrypt/JWT authentication.
 * 5. Strict multi-tenant isolation.
 */

import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  FiMail,
  FiLock,
  FiEye,
  FiEyeOff,
  FiCheck,
  FiCheckCircle,
  FiAlertCircle,
  FiArrowRight,
  FiArrowLeft,
  FiBriefcase,
  FiShield,
  FiRefreshCw,
  FiKey,
  FiTrendingUp,
} from "react-icons/fi";
import {
  loginUser,
  sendRegisterOtp,
  verifyRegisterOtp,
  checkBusinessIdAvailability,
  registerBusiness,
  sendForgotPasswordOtp,
  verifyForgotPasswordOtp,
  resetPasswordWithToken,
  isAuthenticated,
} from "../../services/authService.js";
import { toast } from "../../components/Common/Toast.jsx";

export default function AuthPage({ initialMode = "login" }) {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/dashboard";

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated()) {
      navigate(from, { replace: true });
    }
  }, [navigate, from]);

  const [mode, setMode] = useState(initialMode === "register" ? "register" : "login");

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  // Register form state
  const [registerStep, setRegisterStep] = useState(1); // 1 = Email & OTP, 2 = Business & Password
  const [regEmail, setRegEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerifying, setOtpVerifying] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);

  // Step 2 state
  const [businessId, setBusinessId] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [checkingBizId, setCheckingBizId] = useState(false);
  const [bizIdAvailable, setBizIdAvailable] = useState(null); // true | false | null
  const [bizIdFeedback, setBizIdFeedback] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirmPassword, setRegConfirmPassword] = useState("");
  const [showRegPassword, setShowRegPassword] = useState(false);
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState("");

  // Forgot password state
  const [forgotStep, setForgotStep] = useState(1); // 1 = Enter Email, 2 = Enter OTP, 3 = New Password
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtp, setForgotOtp] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setInterval(() => {
        setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [resendCooldown]);

  // -------------------------------------------------------------
  // Forgot Password Handlers
  // -------------------------------------------------------------
  const handleForgotSendOtp = async (e) => {
    if (e) e.preventDefault();
    setForgotError("");

    const email = forgotEmail.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      const errMsg = "Please enter a valid Gmail / business email address.";
      setForgotError(errMsg);
      toast.error(errMsg);
      return;
    }

    if (resendCooldown > 0) {
      const errMsg = `Please wait ${resendCooldown}s before requesting a new code.`;
      setForgotError(errMsg);
      toast.warning(errMsg);
      return;
    }

    setForgotLoading(true);
    try {
      await sendForgotPasswordOtp({ email });
      setResendCooldown(45);
      toast.success("Verification code sent to your email!");
      setForgotStep(2);
    } catch (err) {
      const msg = err.message || "Failed to send reset code.";
      setForgotError(msg);
      if (msg.toLowerCase().includes("no account for this gmail") || msg.toLowerCase().includes("no account")) {
        toast.error("There is no account for this gmail in USK");
      } else {
        toast.error(msg);
      }
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotVerifyOtp = async (e) => {
    if (e) e.preventDefault();
    setForgotError("");

    const otp = forgotOtp.trim();
    if (!otp || otp.length !== 6) {
      const errMsg = "Please enter the 6-digit verification code sent to your email.";
      setForgotError(errMsg);
      toast.error(errMsg);
      return;
    }

    setForgotLoading(true);
    try {
      const res = await verifyForgotPasswordOtp({ email: forgotEmail.trim(), otp });
      if (res.resetToken) {
        setResetToken(res.resetToken);
        toast.success("Code verified! Please enter your new password.");
        setForgotStep(3);
      } else {
        throw new Error("Reset token not received. Please try again.");
      }
    } catch (err) {
      const msg = err.message || "Invalid verification code.";
      setForgotError(msg);
      toast.error(msg);
    } finally {
      setForgotLoading(false);
    }
  };

  const handleForgotResetPassword = async (e) => {
    if (e) e.preventDefault();
    setForgotError("");

    if (newPassword.length < 6) {
      const errMsg = "New password must be at least 6 characters long.";
      setForgotError(errMsg);
      toast.error(errMsg);
      return;
    }
    if (newPassword !== confirmNewPassword) {
      const errMsg = "Passwords do not match. Please re-enter.";
      setForgotError(errMsg);
      toast.error(errMsg);
      return;
    }

    setForgotLoading(true);
    try {
      await resetPasswordWithToken({
        email: forgotEmail.trim(),
        resetToken,
        newPassword,
        confirmPassword: confirmNewPassword,
      });

      toast.success("Password reset successful! Please sign in with your new password.");
      setLoginEmail(forgotEmail.trim());
      setLoginPassword("");
      setMode("login");
      setForgotStep(1);
      setForgotOtp("");
      setResetToken("");
      setNewPassword("");
      setConfirmNewPassword("");
      setForgotError("");
    } catch (err) {
      const msg = err.message || "Failed to reset password.";
      setForgotError(msg);
      toast.error(msg);
    } finally {
      setForgotLoading(false);
    }
  };

  // -------------------------------------------------------------
  // Login Handler
  // -------------------------------------------------------------
  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError("");
    if (!loginEmail.trim() || !loginPassword) {
      setLoginError("Please enter your email and password.");
      return;
    }

    setLoginLoading(true);
    try {
      await loginUser({
        email: loginEmail.trim(),
        password: loginPassword,
      });
      window.location.href = from && from !== "/login" ? from : "/dashboard";
    } catch (err) {
      setLoginError(err.message || "Failed to sign in. Please verify your credentials.");
    } finally {
      setLoginLoading(false);
    }
  };

  // -------------------------------------------------------------
  // Register Step 1: Send OTP
  // -------------------------------------------------------------
  const handleSendOtp = async () => {
    setRegisterError("");
    if (!regEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(regEmail.trim())) {
      setRegisterError("Please enter a valid email address.");
      return;
    }

    setOtpSending(true);
    try {
      await sendRegisterOtp({ email: regEmail.trim() });
      setOtpSent(true);
    } catch (err) {
      setRegisterError(err.message || "Could not send verification code.");
    } finally {
      setOtpSending(false);
    }
  };

  // -------------------------------------------------------------
  // Register Step 1: Verify OTP
  // -------------------------------------------------------------
  const handleVerifyOtp = async () => {
    setRegisterError("");
    if (!otpCode.trim() || otpCode.trim().length !== 6) {
      setRegisterError("Please enter the 6-digit code sent to your email.");
      return;
    }

    setOtpVerifying(true);
    try {
      await verifyRegisterOtp({ email: regEmail.trim(), otp: otpCode.trim() });
      setEmailVerified(true);
      setRegisterStep(2);

      // Auto-suggest initial business ID and name from email prefix
      const emailPrefix = regEmail.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
      const suggestedId = emailPrefix.length >= 3 ? emailPrefix : `${emailPrefix}-biz`;
      setBusinessId(suggestedId);
      setBusinessName(
        suggestedId
          .split("-")
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(" ")
      );
      checkBizIdAvailability(suggestedId);
    } catch (err) {
      setRegisterError(err.message || "Invalid or expired verification code.");
    } finally {
      setOtpVerifying(false);
    }
  };

  // -------------------------------------------------------------
  // Register Step 2: Check Business ID Availability
  // -------------------------------------------------------------
  const checkBizIdAvailability = async (idToCheck) => {
    const cleanId = String(idToCheck || "").trim().toLowerCase();
    if (cleanId.length < 3) {
      setBizIdAvailable(null);
      setBizIdFeedback("Business ID must be at least 3 characters.");
      return;
    }
    setCheckingBizId(true);
    try {
      const res = await checkBusinessIdAvailability(cleanId);
      setBizIdAvailable(res.available);
      setBizIdFeedback(res.message);
    } catch (err) {
      setBizIdAvailable(false);
      setBizIdFeedback(err.message || "Could not verify ID availability.");
    } finally {
      setCheckingBizId(false);
    }
  };

  const handleBusinessIdChange = (e) => {
    // Slugify format: lowercase letters, numbers, hyphens only
    const val = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    setBusinessId(val);
    if (val.length >= 3) {
      checkBizIdAvailability(val);
    } else {
      setBizIdAvailable(null);
      setBizIdFeedback("");
    }
  };

  // -------------------------------------------------------------
  // Register Step 2: Finalize Registration
  // -------------------------------------------------------------
  const handleFinalRegister = async (e) => {
    e.preventDefault();
    setRegisterError("");

    if (!businessId.trim() || !bizIdAvailable) {
      setRegisterError("Please choose a unique and valid Business ID.");
      return;
    }
    if (regPassword.length < 6) {
      setRegisterError("Password must be at least 6 characters.");
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setRegisterError("Passwords do not match.");
      return;
    }

    setRegisterLoading(true);
    try {
      await registerBusiness({
        email: regEmail.trim(),
        otp: otpCode.trim(),
        businessId: businessId.trim(),
        businessName: businessName.trim() || businessId.trim(),
        password: regPassword,
        confirmPassword: regConfirmPassword,
      });

      window.location.href = from && from !== "/login" ? from : "/dashboard";
    } catch (err) {
      setRegisterError(err.message || "Registration failed. Please try again.");
    } finally {
      setRegisterLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#111827] text-slate-100 flex items-center justify-center p-4 sm:p-6 lg:p-8 relative overflow-hidden font-sans">
      {/* Background ambient glowing spheres */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#FF5A1F]/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-[#FF5A1F]/15 rounded-full blur-[140px] pointer-events-none" />

      {/* Main Container Card */}
      <div className="w-full max-w-4xl bg-[#161921] border border-slate-800 rounded-2xl shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 relative z-10">
        
        {/* Left Side: Brand & Feature Highlights (Hidden on small mobile) */}
        <div className="lg:col-span-5 bg-gradient-to-br from-[#1C202B] to-[#12151D] p-6 sm:p-8 flex flex-col justify-between border-b lg:border-b-0 lg:border-r border-slate-800">
          <div>
            {/* Logo */}
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#EA580C] to-[#FF5A1F] flex items-center justify-center shadow-lg shadow-[#FF5A1F]/20 text-white font-black text-xl">
                U
              </div>
              <div>
                <span className="text-xl font-bold tracking-tight text-white">USK</span>
                <p className="text-xs text-slate-400">Business ERP & Billing Suite</p>
              </div>
            </div>

            <div className="space-y-4 my-8">
              <h2 className="text-lg sm:text-xl font-bold text-white leading-snug">
                Complete Business Control for Retail, Wholesale & Services
              </h2>
              <p className="text-xs sm:text-sm text-slate-400">
                Manage all your GST invoicing, stock inventory, party accounts, and payments with multi-tenant data isolation.
              </p>
            </div>

            {/* Feature Bullets */}
            <div className="space-y-3">
              <div className="flex items-start space-x-3 text-xs sm:text-sm text-slate-300">
                <div className="w-5 h-5 rounded-full bg-[#FF5A1F]/15 text-[#FF5A1F] flex items-center justify-center shrink-0 mt-0.5">
                  <FiShield className="w-3 h-3" />
                </div>
                <span><strong>Multi-Tenant Isolation:</strong> Your business records and invoices are strictly isolated with your unique Tenant ID.</span>
              </div>
              <div className="flex items-start space-x-3 text-xs sm:text-sm text-slate-300">
                <div className="w-5 h-5 rounded-full bg-[#FF5A1F]/15 text-[#FF5A1F] flex items-center justify-center shrink-0 mt-0.5">
                  <FiTrendingUp className="w-3 h-3" />
                </div>
                <span><strong>Automated Accounting:</strong> GST Invoices, POS counters, GSTR-3B tax reports, and ledger statements.</span>
              </div>
              <div className="flex items-start space-x-3 text-xs sm:text-sm text-slate-300">
                <div className="w-5 h-5 rounded-full bg-[#FF5A1F]/15 text-[#FF5A1F] flex items-center justify-center shrink-0 mt-0.5">
                  <FiKey className="w-3 h-3" />
                </div>
                <span><strong>Bank-Grade Security:</strong> Bcrypt password hashing, JWT session protection, and zero MySQL binary bloat.</span>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-4 border-t border-slate-800 text-[11px] text-slate-500 flex justify-between">
            <span>&copy; {new Date().getFullYear()} USK ERP Suite</span>
            <span className="text-slate-400">Secure Cloud Edition</span>
          </div>
        </div>

        {/* Right Side: Authentication Forms */}
        <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-center">
          
          {/* Header Switcher Tabs */}
          {mode === "forgot" ? (
            <div className="flex items-center justify-between p-2 bg-[#111319] rounded-xl border border-slate-800 mb-6">
              <span className="text-xs sm:text-sm font-semibold text-slate-200 px-3 flex items-center gap-2">
                <FiKey className="text-[#FF5A1F]" /> Reset Business Password
              </span>
              <button
                type="button"
                onClick={() => { setMode("login"); setForgotError(""); }}
                className="py-1.5 px-3 text-xs font-semibold rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition flex items-center gap-1.5 cursor-pointer"
              >
                <FiArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
              </button>
            </div>
          ) : (
            <div className="flex p-1 bg-[#111319] rounded-xl border border-slate-800 mb-6">
              <button
                type="button"
                onClick={() => { setMode("login"); setLoginError(""); }}
                className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 ${
                  mode === "login"
                    ? "bg-[#FF5A1F] text-white shadow-md shadow-[#FF5A1F]/20"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Sign In to Business
              </button>
              <button
                type="button"
                onClick={() => { setMode("register"); setRegisterError(""); }}
                className={`flex-1 py-2 text-xs sm:text-sm font-semibold rounded-lg transition-all duration-200 ${
                  mode === "register"
                    ? "bg-[#FF5A1F] text-white shadow-md shadow-[#FF5A1F]/20"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                Register New Business
              </button>
            </div>
          )}

          {/* ============================================================== */}
          {/* 1. SIGN IN FORM                                                */}
          {/* ============================================================== */}
          {mode === "login" && (
            <div>
              <div className="mb-5">
                <h3 className="text-xl font-bold text-white">Sign In</h3>
                <p className="text-xs sm:text-sm text-slate-400">Enter your email and password to access your business data.</p>
              </div>

              {loginError && (
                <div className="mb-4 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-center space-x-2">
                  <FiAlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{loginError}</span>
                </div>
              )}

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Business Email</label>
                  <div className="relative">
                    <FiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                      type="email"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder="e.g. owner@mybusiness.com"
                      required
                      className="w-full bg-[#111319] border border-slate-700/80 rounded-lg pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FF5A1F] focus:ring-1 focus:ring-[#FF5A1F] transition"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">Password</label>
                  <div className="relative">
                    <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <input
                      type={showLoginPassword ? "text" : "password"}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      required
                      className="w-full bg-[#111319] border border-slate-700/80 rounded-lg pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FF5A1F] focus:ring-1 focus:ring-[#FF5A1F] transition"
                    />
                    <button
                      type="button"
                      onClick={() => setShowLoginPassword(!showLoginPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition"
                      tabIndex={-1}
                    >
                      {showLoginPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="flex justify-end pt-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setMode("forgot");
                      setForgotStep(1);
                      setForgotEmail(loginEmail || "");
                      setForgotError("");
                    }}
                    className="text-xs text-[#FF5A1F] hover:text-[#EA580C] hover:underline font-medium transition cursor-pointer"
                  >
                    Forgot password?
                  </button>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loginLoading}
                    className="w-full py-2.5 px-4 bg-[#FF5A1F] hover:bg-[#EA580C] text-white font-semibold rounded-lg text-sm transition shadow-lg shadow-[#FF5A1F]/20 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
                  >
                    {loginLoading ? (
                      <>
                        <FiRefreshCw className="w-4 h-4 animate-spin" />
                        <span>Verifying credentials...</span>
                      </>
                    ) : (
                      <>
                        <span>Sign In to Workspace</span>
                        <FiArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </form>

              <div className="mt-6 text-center text-xs text-slate-400">
                Need to register your business?{" "}
                <button
                  type="button"
                  onClick={() => { setMode("register"); setRegisterError(""); }}
                  className="text-[#FF5A1F] hover:underline font-semibold cursor-pointer"
                >
                  Create your Business Workspace &rarr;
                </button>
              </div>
            </div>
          )}

          {/* ============================================================== */}
          {/* 2. FORGOT PASSWORD FLOW (3-STEP WIZARD)                        */}
          {/* ============================================================== */}
          {mode === "forgot" && (
            <div>
              {/* Stepper Progress */}
              <div className="flex items-center justify-between mb-6 px-1">
                <div className={`flex items-center gap-2 text-xs font-semibold ${forgotStep >= 1 ? "text-[#FF5A1F]" : "text-slate-500"}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${forgotStep >= 1 ? "bg-[#FF5A1F] text-white" : "bg-slate-800 text-slate-400"}`}>1</span>
                  <span>Enter Gmail</span>
                </div>
                <div className={`h-0.5 flex-1 mx-2 transition-colors ${forgotStep >= 2 ? "bg-[#FF5A1F]" : "bg-slate-800"}`} />
                <div className={`flex items-center gap-2 text-xs font-semibold ${forgotStep >= 2 ? "text-[#FF5A1F]" : "text-slate-500"}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${forgotStep >= 2 ? "bg-[#FF5A1F] text-white" : "bg-slate-800 text-slate-400"}`}>2</span>
                  <span>Verify OTP</span>
                </div>
                <div className={`h-0.5 flex-1 mx-2 transition-colors ${forgotStep >= 3 ? "bg-[#FF5A1F]" : "bg-slate-800"}`} />
                <div className={`flex items-center gap-2 text-xs font-semibold ${forgotStep >= 3 ? "text-[#FF5A1F]" : "text-slate-500"}`}>
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${forgotStep >= 3 ? "bg-[#FF5A1F] text-white" : "bg-slate-800 text-slate-400"}`}>3</span>
                  <span>New Password</span>
                </div>
              </div>

              {forgotError && (
                <div className="mb-4 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-center space-x-2">
                  <FiAlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{forgotError}</span>
                </div>
              )}

              {/* Step 1: Enter Gmail */}
              {forgotStep === 1 && (
                <form onSubmit={handleForgotSendOtp} className="space-y-4">
                  <div className="mb-4">
                    <h3 className="text-xl font-bold text-white">Reset Account Password</h3>
                    <p className="text-xs sm:text-sm text-slate-400 mt-1">
                      Enter the Gmail or business email registered with your USK account. We will verify your account and send a 6-digit verification code.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Registered Gmail / Email</label>
                    <div className="relative">
                      <FiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <input
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="e.g. yourname@gmail.com"
                        required
                        autoFocus
                        className="w-full bg-[#111319] border border-slate-700/80 rounded-lg pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FF5A1F] focus:ring-1 focus:ring-[#FF5A1F] transition"
                      />
                    </div>
                  </div>

                  <div className="p-3 bg-[#111319] border border-slate-800 rounded-lg text-xs text-slate-400 space-y-1.5">
                    <div className="flex items-center gap-1.5 text-slate-300 font-medium">
                      <FiShield className="w-3.5 h-3.5 text-[#FF5A1F]" /> Rate Limiting & Protection
                    </div>
                    <p>Password reset requests are rate-limited to 3 attempts per 10 minutes to protect your business account against automated attacks.</p>
                    <p className="text-slate-400/90 border-t border-slate-800/80 pt-1.5">
                      <span className="text-slate-300 font-medium">Notice:</span> Verification emails may be filtered into your Spam or Junk folder—please check there if it doesn&apos;t appear in your inbox.
                    </p>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={forgotLoading || resendCooldown > 0}
                      className="w-full py-2.5 px-4 bg-[#FF5A1F] hover:bg-[#EA580C] text-white font-semibold rounded-lg text-sm transition shadow-lg shadow-[#FF5A1F]/20 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
                    >
                      {forgotLoading ? (
                        <>
                          <FiRefreshCw className="w-4 h-4 animate-spin" />
                          <span>Verifying account & sending code...</span>
                        </>
                      ) : resendCooldown > 0 ? (
                        <span>Wait {resendCooldown}s before requesting again</span>
                      ) : (
                        <>
                          <span>Send Verification Code</span>
                          <FiArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>

                  <div className="text-center pt-2">
                    <button
                      type="button"
                      onClick={() => { setMode("login"); setForgotError(""); }}
                      className="text-xs text-slate-400 hover:text-white hover:underline transition"
                    >
                      &larr; Return to Sign In
                    </button>
                  </div>
                </form>
              )}

              {/* Step 2: Enter OTP */}
              {forgotStep === 2 && (
                <form onSubmit={handleForgotVerifyOtp} className="space-y-4">
                  <div className="mb-4">
                    <h3 className="text-xl font-bold text-white">Enter Verification Code</h3>
                    <p className="text-xs sm:text-sm text-slate-400 mt-1">
                      We sent a 6-digit code to <strong className="text-white">{forgotEmail}</strong>. Please enter it below to verify your identity.
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1.5">
                      Didn&apos;t receive it in your inbox? Please check your <span className="text-slate-300 font-medium">Spam / Junk</span> folder.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">6-Digit OTP Code</label>
                    <div className="relative">
                      <FiKey className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <input
                        type="text"
                        maxLength={6}
                        value={forgotOtp}
                        onChange={(e) => setForgotOtp(e.target.value.replace(/\D/g, ""))}
                        placeholder="123456"
                        required
                        autoFocus
                        className="w-full bg-[#111319] border border-slate-700/80 rounded-lg pl-10 pr-3.5 py-2.5 text-base tracking-widest font-mono text-center text-white placeholder-slate-600 focus:outline-none focus:border-[#FF5A1F] focus:ring-1 focus:ring-[#FF5A1F] transition"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <button
                      type="button"
                      onClick={() => { setForgotStep(1); setForgotOtp(""); }}
                      className="text-slate-400 hover:text-white hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <FiArrowLeft className="w-3 h-3" /> Change email
                    </button>
                    <button
                      type="button"
                      onClick={handleForgotSendOtp}
                      disabled={forgotLoading || resendCooldown > 0}
                      className="text-[#FF5A1F] hover:underline disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
                    </button>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={forgotLoading || forgotOtp.trim().length !== 6}
                      className="w-full py-2.5 px-4 bg-[#FF5A1F] hover:bg-[#EA580C] text-white font-semibold rounded-lg text-sm transition shadow-lg shadow-[#FF5A1F]/20 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
                    >
                      {forgotLoading ? (
                        <>
                          <FiRefreshCw className="w-4 h-4 animate-spin" />
                          <span>Verifying code...</span>
                        </>
                      ) : (
                        <>
                          <span>Verify & Continue</span>
                          <FiArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}

              {/* Step 3: Enter New Password */}
              {forgotStep === 3 && (
                <form onSubmit={handleForgotResetPassword} className="space-y-4">
                  <div className="mb-4">
                    <h3 className="text-xl font-bold text-white">Create New Password</h3>
                    <p className="text-xs sm:text-sm text-slate-400 mt-1">
                      Identity verified for <strong className="text-white">{forgotEmail}</strong>. Set your new secure password below.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">New Password</label>
                    <div className="relative">
                      <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <input
                        type={showNewPassword ? "text" : "password"}
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="At least 6 characters"
                        required
                        autoFocus
                        minLength={6}
                        className="w-full bg-[#111319] border border-slate-700/80 rounded-lg pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FF5A1F] focus:ring-1 focus:ring-[#FF5A1F] transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                        tabIndex={-1}
                      >
                        {showNewPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Confirm New Password</label>
                    <div className="relative">
                      <FiLock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <input
                        type={showConfirmNewPassword ? "text" : "password"}
                        value={confirmNewPassword}
                        onChange={(e) => setConfirmNewPassword(e.target.value)}
                        placeholder="Re-enter your new password"
                        required
                        minLength={6}
                        className="w-full bg-[#111319] border border-slate-700/80 rounded-lg pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FF5A1F] focus:ring-1 focus:ring-[#FF5A1F] transition"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition cursor-pointer"
                        tabIndex={-1}
                      >
                        {showConfirmNewPassword ? <FiEyeOff className="w-4 h-4" /> : <FiEye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="p-3 bg-[#111319] border border-slate-800 rounded-lg text-xs text-slate-400 space-y-1">
                    <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                      <FiCheckCircle className="w-3.5 h-3.5" /> Automatic Session Invalidation
                    </div>
                    <p>Upon password change, all active sessions and tokens across other devices will be terminated automatically for your security.</p>
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={forgotLoading || !newPassword || newPassword !== confirmNewPassword}
                      className="w-full py-2.5 px-4 bg-[#FF5A1F] hover:bg-[#EA580C] text-white font-semibold rounded-lg text-sm transition shadow-lg shadow-[#FF5A1F]/20 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
                    >
                      {forgotLoading ? (
                        <>
                          <FiRefreshCw className="w-4 h-4 animate-spin" />
                          <span>Updating password...</span>
                        </>
                      ) : (
                        <>
                          <span>Save & Sign In With New Password</span>
                          <FiCheck className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ============================================================== */}
          {/* 3. REGISTRATION FLOW                                           */}
          {/* ============================================================== */}
          {mode === "register" && (
            <div>
              <div className="mb-4">
                <div className="flex items-center space-x-2 text-xs font-semibold text-[#FF5A1F] mb-1">
                  <span>Step {registerStep} of 2</span>
                  <span>&bull;</span>
                  <span>{registerStep === 1 ? "Verify Email" : "Business Setup"}</span>
                </div>
                <h3 className="text-xl font-bold text-white">
                  {registerStep === 1 ? "Verify Your Email" : "Configure Your Business"}
                </h3>
                <p className="text-xs sm:text-sm text-slate-400">
                  {registerStep === 1
                    ? "We send a 6-digit verification code to confirm ownership."
                    : "Choose your unique Business ID to isolate your records."}
                </p>
              </div>

              {registerError && (
                <div className="mb-4 p-3 rounded-lg bg-red-950/40 border border-red-800/60 text-red-300 text-xs flex items-center space-x-2">
                  <FiAlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{registerError}</span>
                </div>
              )}

              {/* -------------------------------------------------------- */}
              {/* STAGE 1: Email & OTP Verification                        */}
              {/* -------------------------------------------------------- */}
              {registerStep === 1 && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">Official Business Email</label>
                    <div className="flex space-x-2">
                      <div className="relative flex-1">
                        <FiMail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                        <input
                          type="email"
                          value={regEmail}
                          disabled={otpSent}
                          onChange={(e) => setRegEmail(e.target.value)}
                          placeholder="e.g. contact@mybusiness.com"
                          className="w-full bg-[#111319] border border-slate-700/80 rounded-lg pl-10 pr-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FF5A1F] focus:ring-1 focus:ring-[#FF5A1F] transition disabled:opacity-60"
                        />
                      </div>
                      {!otpSent ? (
                        <button
                          type="button"
                          onClick={handleSendOtp}
                          disabled={otpSending || !regEmail.trim()}
                          className="px-4 py-2.5 bg-[#FF5A1F] hover:bg-[#EA580C] text-white text-xs sm:text-sm font-semibold rounded-lg transition disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer shrink-0"
                        >
                          {otpSending ? <FiRefreshCw className="w-4 h-4 animate-spin" /> : "Send Code"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => { setOtpSent(false); setOtpCode(""); }}
                          className="px-3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg transition cursor-pointer"
                        >
                          Change
                        </button>
                      )}
                    </div>
                  </div>

                  {otpSent && (
                    <div className="pt-2 animate-fadeIn">
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">Enter 6-Digit Verification Code</label>
                      <input
                        type="text"
                        maxLength={6}
                        value={otpCode}
                        onChange={(e) => setOtpCode(e.target.value.replace(/[^0-9]/g, ""))}
                        placeholder="123456"
                        className="w-full bg-[#111319] border border-[#FF5A1F]/60 text-center text-2xl tracking-[8px] font-mono font-bold text-white rounded-lg py-2.5 focus:outline-none focus:ring-2 focus:ring-[#FF5A1F] transition"
                      />
                      <div className="flex justify-between items-center text-xs text-slate-400 mt-2">
                        <span>Code expires in 10 minutes</span>
                        <button
                          type="button"
                          onClick={handleSendOtp}
                          disabled={otpSending}
                          className="text-[#FF5A1F] hover:underline cursor-pointer"
                        >
                          Resend Code
                        </button>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1.5">
                        If the code isn&apos;t in your inbox, please check your <span className="text-slate-300 font-medium">Spam / Junk</span> folder.
                      </p>

                      <div className="pt-4">
                        <button
                          type="button"
                          onClick={handleVerifyOtp}
                          disabled={otpVerifying || otpCode.length !== 6}
                          className="w-full py-2.5 px-4 bg-[#FF5A1F] hover:bg-[#EA580C] text-white font-semibold rounded-lg text-sm transition shadow-lg shadow-[#FF5A1F]/20 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
                        >
                          {otpVerifying ? (
                            <>
                              <FiRefreshCw className="w-4 h-4 animate-spin" />
                              <span>Verifying code...</span>
                            </>
                          ) : (
                            <>
                              <span>Verify Email & Continue</span>
                              <FiArrowRight className="w-4 h-4" />
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="mt-4 pt-4 border-t border-slate-800 text-center text-xs text-slate-400">
                    Already registered?{" "}
                    <button
                      type="button"
                      onClick={() => { setMode("login"); setLoginError(""); }}
                      className="text-[#FF5A1F] hover:underline font-semibold cursor-pointer"
                    >
                      Sign In here &rarr;
                    </button>
                  </div>
                </div>
              )}

              {/* -------------------------------------------------------- */}
              {/* STAGE 2: Business ID & Password Credentials              */}
              {/* -------------------------------------------------------- */}
              {registerStep === 2 && (
                <form onSubmit={handleFinalRegister} className="space-y-3.5">
                  <div className="p-2.5 rounded-lg bg-green-950/30 border border-green-800/40 text-green-300 text-xs flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <FiCheckCircle className="w-4 h-4 text-green-400" />
                      <span>Verified: <strong>{regEmail}</strong></span>
                    </div>
                    <span className="text-[10px] bg-green-900/50 px-2 py-0.5 rounded text-green-300 font-bold">READY</span>
                  </div>

                  {/* Business Tenant ID */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Unique Business ID (Tenant ID) <span className="text-[#FF5A1F]">*</span>
                    </label>
                    <div className="relative">
                      <FiBriefcase className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <input
                        type="text"
                        value={businessId}
                        onChange={handleBusinessIdChange}
                        placeholder="e.g. sai-kirana"
                        required
                        className={`w-full bg-[#111319] border ${
                          bizIdAvailable === true
                            ? "border-green-600 focus:border-green-500 focus:ring-green-500"
                            : bizIdAvailable === false
                            ? "border-red-600 focus:border-red-500 focus:ring-red-500"
                            : "border-slate-700/80 focus:border-[#FF5A1F] focus:ring-[#FF5A1F]"
                        } rounded-lg pl-10 pr-10 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-1 transition`}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2">
                        {checkingBizId && <FiRefreshCw className="w-4 h-4 text-slate-400 animate-spin" />}
                        {!checkingBizId && bizIdAvailable === true && <FiCheck className="w-4 h-4 text-green-400 font-bold" />}
                        {!checkingBizId && bizIdAvailable === false && <FiAlertCircle className="w-4 h-4 text-red-400" />}
                      </div>
                    </div>
                    <div className="flex justify-between items-center mt-1">
                      <p className={`text-[11px] ${bizIdAvailable === true ? "text-green-400" : bizIdAvailable === false ? "text-red-400" : "text-slate-400"}`}>
                        {bizIdFeedback || "Lowercase letters, numbers, and hyphens only (e.g. 'ram-traders')."}
                      </p>
                    </div>
                  </div>

                  {/* Business Display Name */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">Business Name</label>
                    <input
                      type="text"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                      placeholder="e.g. Sai Kirana Stores"
                      className="w-full bg-[#111319] border border-slate-700/80 rounded-lg px-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FF5A1F] focus:ring-1 focus:ring-[#FF5A1F] transition"
                    />
                  </div>

                  {/* Password & Confirm */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
                      <div className="relative">
                        <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                        <input
                          type={showRegPassword ? "text" : "password"}
                          value={regPassword}
                          onChange={(e) => setRegPassword(e.target.value)}
                          placeholder="Min 6 chars"
                          required
                          className="w-full bg-[#111319] border border-slate-700/80 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FF5A1F] focus:ring-1 focus:ring-[#FF5A1F] transition"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">Confirm Password</label>
                      <div className="relative">
                        <FiLock className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-3.5 h-3.5" />
                        <input
                          type={showRegPassword ? "text" : "password"}
                          value={regConfirmPassword}
                          onChange={(e) => setRegConfirmPassword(e.target.value)}
                          placeholder="Repeat password"
                          required
                          className="w-full bg-[#111319] border border-slate-700/80 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-[#FF5A1F] focus:ring-1 focus:ring-[#FF5A1F] transition"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <label className="flex items-center space-x-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showRegPassword}
                        onChange={(e) => setShowRegPassword(e.target.checked)}
                        className="rounded border-slate-700 bg-slate-900 text-[#FF5A1F] focus:ring-[#FF5A1F]"
                      />
                      <span>Show passwords</span>
                    </label>

                    {regPassword && regConfirmPassword && (
                      <span className={regPassword === regConfirmPassword ? "text-green-400" : "text-red-400"}>
                        {regPassword === regConfirmPassword ? "✓ Passwords match" : "✕ Passwords mismatch"}
                      </span>
                    )}
                  </div>

                  <div className="pt-2">
                    <button
                      type="submit"
                      disabled={registerLoading || !bizIdAvailable || regPassword.length < 6 || regPassword !== regConfirmPassword}
                      className="w-full py-2.5 px-4 bg-[#FF5A1F] hover:bg-[#EA580C] text-white font-semibold rounded-lg text-sm transition shadow-lg shadow-[#FF5A1F]/20 flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
                    >
                      {registerLoading ? (
                        <>
                          <FiRefreshCw className="w-4 h-4 animate-spin" />
                          <span>Creating your business workspace...</span>
                        </>
                      ) : (
                        <>
                          <span>Complete Registration & Launch Workspace</span>
                          <FiArrowRight className="w-4 h-4" />
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
