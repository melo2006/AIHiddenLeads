// @vitest-environment node
import { test,expect } from 'vitest';
import { learningLinks } from '../../supabase/functions/_shared/website-learning';
test('first-level bank learning prioritizes products and excludes employee pages',()=>{
  expect(learningLinks(['/careers/benefits','/personal/checking','/personal/savings','https://other.com/loans'],'https://bankunited.com/',20)).toEqual(['https://bankunited.com/personal/checking','https://bankunited.com/personal/savings']);
});
test('a specific home never learns other listings or the parent homepage',()=>{
  expect(learningLinks(['/815-rio-vista/photos','/816-other-home','/','/815-rio-vista-other'],'https://media.p3mediatx.com/815-rio-vista',20)).toEqual(['https://media.p3mediatx.com/815-rio-vista/photos']);
});