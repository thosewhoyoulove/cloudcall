import { useEffect, useState } from 'react';

export function Login({ children }: { children: React.ReactNode }) {
  const [authorized, setAuthorized] = useState(false);
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/session', { signal: controller.signal, cache: 'no-store' })
      .then((response) => {
        if (response.ok) setAuthorized(true);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, []);
  if (checking) return <p role="status">正在检查登录状态…</p>;
  if (authorized) return <>{children}</>;
  return (
    <main className="page" style={{ maxWidth: 480, margin: '10vh auto' }}>
      <h1>CloudCall 登录</h1>
      <p>登录后连接分机，拨打真实电话。</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setBusy(true);
          setError('');
          void fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
          })
            .then((response) => {
              if (!response.ok) throw new Error('登录失败，请检查账号或稍后重试');
              setPassword('');
              setAuthorized(true);
            })
            .catch((caught: unknown) =>
              setError(caught instanceof Error ? caught.message : '无法连接服务器'),
            )
            .finally(() => setBusy(false));
        }}
      >
        <label>
          账号
          <input
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label>
          密码
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit" className="btn-dial" disabled={busy}>
          {busy ? '登录中…' : '登录'}
        </button>
        {error && <p role="alert">{error}</p>}
      </form>
    </main>
  );
}
