import {expect,test,vi} from 'vitest';
import {render,screen} from '@testing-library/react';
import AssistantErrorBoundary from '../components/AssistantErrorBoundary';
test('assistant failure leaves sibling page content available',()=>{
 const log=vi.spyOn(console,'error').mockImplementation(()=>{});
 const Broken=()=>{throw new Error('Simulated widget crash');};
 render(<><h1>Business website</h1><AssistantErrorBoundary><Broken/></AssistantErrorBoundary></>);
 expect(screen.getByRole('heading',{name:'Business website'})).toBeTruthy();
 expect(screen.getByRole('button',{name:'Restart Aspen'})).toBeTruthy();log.mockRestore();
});