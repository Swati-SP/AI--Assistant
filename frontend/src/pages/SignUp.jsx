// src/pages/SignUp.jsx
import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { signup } from "../api/authApi";

export default function SignUp() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/";

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function validate() {
    const e = {};
    if (name.trim().length < 2) e.name = "Enter your full name";
    if (!/^\S+@\S+\.\S+$/.test(email)) e.email = "Enter a valid email";
    if (password.length < 6) e.password = "Minimum 6 characters";
    if (confirm !== password) e.confirm = "Passwords do not match";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setApiError("");
    if (!validate()) return;
    setSubmitting(true);
    try {
      await signup({ name, email, password });
      navigate(from, { replace: true }); // ⬅ go back to intended page
    } catch (err) {
      setApiError(err?.message || "Sign up failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4 border rounded-2xl p-6 bg-white/70 dark:bg-gray-900/60">
        <h1 className="text-2xl font-semibold">Create account</h1>

        {apiError && <p className="text-sm text-red-600">{apiError}</p>}

        <input
          type="text"
          placeholder="Full name"
          className="w-full border rounded p-2"
          value={name}
          onChange={(e)=>setName(e.target.value)}
          aria-invalid={!!errors.name}
          required
        />
        {errors.name && <p className="text-xs text-red-600">{errors.name}</p>}

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

        <input
          type="password"
          placeholder="Confirm password"
          className="w-full border rounded p-2"
          value={confirm}
          onChange={(e)=>setConfirm(e.target.value)}
          aria-invalid={!!errors.confirm}
          required
        />
        {errors.confirm && <p className="text-xs text-red-600">{errors.confirm}</p>}

        <button disabled={submitting} className="w-full rounded p-2 border disabled:opacity-60 hover:bg-gray-50 dark:hover:bg-gray-800">
          {submitting ? "Creating..." : "Sign up"}
        </button>

        <p className="text-sm">
          Already have an account? <Link to="/login" className="underline">Log in</Link>
        </p>
      </form>
    </div>
  );
}
