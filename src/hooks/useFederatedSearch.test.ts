import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Job } from '../services/jobsService';
import { useFederatedSearch } from './useFederatedSearch';

const mocks=vi.hoisted(() => ({listen:vi.fn(),list:vi.fn(),snapshot:vi.fn()}));
vi.mock('../services/jobsService', () => ({onJobChanged:mocks.listen}));
vi.mock('../services/federatedSearchService', () => ({listSearches:mocks.list,getSearch:mocks.snapshot}));
beforeEach(() => {vi.resetAllMocks();mocks.list.mockResolvedValue([]);mocks.listen.mockResolvedValue(vi.fn());});
it('subscribes before reading and refreshes when another provider finishes', async () => {
  let handler: (job: Job) => void = () => {};
  mocks.listen.mockImplementation(async (callback) => {handler=callback;return vi.fn();});
  mocks.snapshot.mockResolvedValue({run:{id:'one'},pages:[]});
  const {result}=renderHook(() => useFederatedSearch('one'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(mocks.listen.mock.invocationCallOrder[0]).toBeLessThan(mocks.snapshot.mock.invocationCallOrder[0]);
  act(() => handler({jobType:'provider_search'} as Job));
  await waitFor(() => expect(mocks.snapshot).toHaveBeenCalledTimes(2));
});
it('does not let an old response replace a newly selected search', async () => {
  let resolveOld: (value: unknown) => void = () => {};
  mocks.snapshot.mockImplementation((id) => id === 'old' ? new Promise((resolve) => {resolveOld=resolve;}) : Promise.resolve({run:{id:'new'},pages:[]}));
  const {result,rerender}=renderHook(({id}) => useFederatedSearch(id),{initialProps:{id:'old'}});
  await waitFor(() => expect(mocks.snapshot).toHaveBeenCalledWith('old', undefined));
  rerender({id:'new'});
  await waitFor(() => expect(result.current.selected?.id).toBe('new'));
  await act(async () => resolveOld({run:{id:'old'},pages:[]}));
  expect(result.current.selected?.id).toBe('new');
});
