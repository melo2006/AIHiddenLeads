import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';

export default class AssistantErrorBoundary extends Component<{children:ReactNode}, {failed:boolean}> {
  state = {failed:false};
  static getDerivedStateFromError() { return {failed:true}; }
  componentDidCatch(error:Error, info:ErrorInfo) { console.error('Assistant render failed',error.name,info.componentStack); }
  render() {
    if(this.state.failed) return <div role="alert" className="fixed bottom-3 right-3 z-50 max-w-[calc(100vw-24px)] rounded-lg border border-border bg-card p-4 text-foreground shadow-lg"><p className="text-sm">Aspen’s window needs to restart. Your page is still available.</p><Button size="sm" className="mt-3" onClick={()=>this.setState({failed:false})}><RefreshCw className="mr-2 h-4 w-4"/>Restart Aspen</Button></div>;
    return this.props.children;
  }
}