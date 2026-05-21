export type StarlightComponentOverrides = Record<string, string | undefined>;

export interface StarlightLogger {
  warn(message: string): void;
}

export function setStarlightComponentOverride({
  components,
  component,
  componentPath,
  logger,
  usage,
}: {
  components: StarlightComponentOverrides;
  component: string;
  componentPath: string;
  logger: StarlightLogger;
  usage: string;
}) {
  if (components[component]) {
    logger.warn(
      `A \`<${component}>\` component override is already defined in your Starlight configuration.`,
    );
    logger.warn(
      `To ${usage}, remove that override or render ${componentPath}.`,
    );
    return;
  }

  components[component] = componentPath;
}
