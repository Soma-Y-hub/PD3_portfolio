export default function LoginPage({ loginName, onLoginNameChange, onLogin }) {
  return (
    <div className="login-page">
      <div className="login-card">
        <h1>PBL思考ボード</h1>

        <input
          value={loginName}
          onChange={(e) => onLoginNameChange(e.target.value)}
          placeholder="ユーザー名"
        />

        <button onClick={onLogin}>ログイン</button>
      </div>
    </div>
  );
}
