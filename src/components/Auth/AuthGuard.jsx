/**
 * AuthGuard - Full Route Protection Gate
 * 
 * Prevents unauthenticated users and unregistered businesses from accessing any application route.
 * Redirects unauthenticated visitors to the /login page while saving the return path.
 */

import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { isAuthenticated, AUTH_CHANGED_EVENT } from "../../services/authService.js";

export default function AuthGuard({ children }) {
  const location = useLocation();
  const [authed, setAuthed] = useState(isAuthenticated());

  useEffect(() => {
    const handleAuthChange = () => {
      setAuthed(isAuthenticated());
    };

    window.addEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
    window.addEventListener("storage", handleAuthChange);

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, handleAuthChange);
      window.removeEventListener("storage", handleAuthChange);
    };
  }, []);

  if (!authed) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
