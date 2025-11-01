// src/pages/Login.jsx
import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { login } from "../api/authApi";

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function validate() {
    const e = {};
    if (!/^\S+@\S+\.\S+$/.test(email)) e.email = "Enter a valid email";
    if (password.length < 6) e.password = "Minimum 6 characters";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setApiError("");
    if (!validate()) return;
    setSubmitting(true);
    try {
      await login({ email, password });
      navigate(from, { replace: true }); // ⬅ go back to intended page
    } catch (err) {
      setApiError(err?.message || "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 border rounded-2xl p-6 bg-white/70 dark:bg-gray-900/60">
        <h1 className="text-2xl font-semibold">Log in</h1>

        {apiError && <p className="text-sm text-red-600">{apiError}</p>}

        <input
          type="email"
          placeholder="Email"
          className="w-full border rounded p-2"
          value={email}
          onChange={(e)=>setEmail(e.target.value)}
          aria-invalid={!!errors.email}
          required
        />
        {errors.email && <p className="text-xs text-red-600">{errors.email}</p>}

        <input
          type="password"
          placeholder="Password"
          className="w-full border rounded p-2"
          value={password}
          onChange={(e)=>setPassword(e.target.value)}
          aria-invalid={!!errors.password}
          required
        />
        {errors.password && <p className="text-xs text-red-600">{errors.password}</p>}

        <button disabled={submitting} className="w-full rounded p-2 border disabled:opacity-60 hover:bg-gray-50 dark:hover:bg-gray-800">
          {submitting ? "Checking..." : "Continue"}
        </button>

        <p className="text-sm">
          No account? <Link to="/signup" className="underline">Sign up</Link>
        </p>
      </form>
    </div>
  );
}
