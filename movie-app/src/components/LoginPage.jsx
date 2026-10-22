export default function LoginPage({
  loginId,
  loginCode,
  onLoginIdChange,
  onLoginCodeChange,
  onLogin,
  busy,
  error
}) {
  return (
    <div className="login-page">
      <form
        className="login-card school-login"
        onSubmit={(event) => {
          event.preventDefault();
          if (!busy) onLogin();
        }}
      >
        <h1>PBL思考ボード</h1>
        <p>学校から配布されたユーザーIDとログインコードを入力してください。</p>

        <label htmlFor="school-user-id">ユーザーID（数字）</label>
        <input
          id="school-user-id"
          type="text"
          inputMode="numeric"
          pattern="[0-9]{1,20}"
          autoComplete="username"
          value={loginId}
          maxLength={20}
          required
          disabled={busy}
          onChange={(event) => onLoginIdChange(event.target.value)}
          placeholder="例：00123"
        />

        <label htmlFor="school-login-code">ログインコード（英数字）</label>
        <input
          id="school-login-code"
          type="password"
          autoComplete="current-password"
          autoCapitalize="none"
          spellCheck={false}
          value={loginCode}
          minLength={8}
          maxLength={64}
          pattern="[A-Za-z0-9]{8,64}"
          required
          disabled={busy}
          onChange={(event) => onLoginCodeChange(event.target.value)}
          placeholder="配布されたコード"
        />

        {error && <p role="alert" className="school-error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? "確認中…" : "ログイン"}
        </button>
      </form>
    </div>
  );
}