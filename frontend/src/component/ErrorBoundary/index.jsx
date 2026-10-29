/**
 * 通用错误页面组件
 * 当 React 应用出现未捕获错误时显示
 *
 * 使用方式：
 *   class App extends React.Component { ... }
 *   export default withErrorBoundary(App);
 *   // 或在 main.jsx 中:
 *   // <ErrorBoundary fallback={<ErrorFallback />}>
 *   //   <App />
 *   // </ErrorBoundary>
 */

import React from "react";
function Result({ title, subTitle, extra }) { return <main role="alert" style={{ padding: '48px', maxWidth: 720, margin: 'auto' }}><h1>{title}</h1><p>{subTitle}</p>{extra}</main>; }
const Button = ({ children, onClick }) => <button style={{ minHeight:44, padding:'8px 20px' }} onClick={onClick}>{children}</button>;

/**
 * 错误边界组件
 * 捕获子组件树中的 JS 渲染错误
 */
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("[ErrorBoundary] Caught error:", error, errorInfo);
    // 可以上报到监控平台
    // reportError(error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    // 重新加载页面以清除所有状态
    window.location.hash = window.location.hash || "/dashboard";
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="500"
          title="页面出错"
          subTitle={this.state.error?.message || "渲染时发生错误，请稍后重试"}
          extra={
            <Button type="primary" onClick={this.handleReset}>
              刷新页面
            </Button>
          }
        />
      );
    }

    return this.props.children;
  }
}

/**
 * 默认错误回退 UI（供外层使用）
 */
export const ErrorFallback = () => (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "100vh",
      background: "#f0f2f5"
    }}
  >
    <Result
      status="500"
      title="页面出错"
      subTitle="页面渲染时发生错误，请刷新重试"
      extra={
        <Button type="primary" onClick={() => window.location.reload()}>
          刷新页面
        </Button>
      }
    />
  </div>
);

export default ErrorBoundary;
