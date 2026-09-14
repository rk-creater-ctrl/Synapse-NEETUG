import { VideoProvider } from './video-provider.types';

export const VIDEO_PROVIDER = Symbol('VIDEO_PROVIDER');
export const VIDEO_FETCH = Symbol('VIDEO_FETCH');
export type VideoFetch = typeof fetch;

export type VideoProviderFactory = VideoProvider;
