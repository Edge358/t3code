/** Local-build restrictions. Environment variables cannot relax this policy. */
export const privateBuildPolicy: Readonly<{
  reporting: boolean;
  cloudServices: boolean;
  remoteIcons: boolean;
  automaticAppUpdates: boolean;
  automaticPricingDownloads: boolean;
  /** Repeated background checks; initial provider discovery still runs. */
  automaticProviderChecks: boolean;
  githubStarPrompt: boolean;
}> = Object.freeze({
  reporting: false,
  cloudServices: false,
  remoteIcons: false,
  automaticAppUpdates: false,
  automaticPricingDownloads: false,
  automaticProviderChecks: false,
  githubStarPrompt: false,
});
