import { VideoProvider } from '@prisma/client';
export type PlaybackAccess={videoId:string;provider:VideoProvider;playbackUrl:string|null;expiresAt:Date|null};
export interface VideoProviderAdapter { readonly provider:VideoProvider; createUploadSession():Promise<{uploadUrl:string|null}>; getAssetStatus(assetId:string):Promise<{assetId:string;ready:boolean}>; getPlaybackAccess(video:{id:string;providerAssetId:string;playbackId:string|null}):Promise<PlaybackAccess>; deleteAsset(assetId:string):Promise<void>; }
