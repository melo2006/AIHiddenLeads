import {expect,it} from 'vitest';
import {PHONE_SIMULATION} from '../data/phoneSimulation';
it('uses explicitly fictional business data and three selectable scenarios',()=>{
  expect(PHONE_SIMULATION.business).toBe('Example Key & Lock');
  expect(PHONE_SIMULATION.scenarios.map(s=>s.id)).toEqual(['locked-out','keys','hours']);
});