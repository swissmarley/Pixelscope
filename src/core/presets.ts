export interface PromptPreset {
  id: string;
  name: string;
  description: string;
  prompt: string;
  directory: string;
  reference?: string;
}
/** Prefix a public asset path with Vite's base URL for project-site hosting. */
export function demoAssetUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}
export const promptPresets: readonly PromptPreset[] = [
  {
    id: "alpine",
    name: "The alpine cabin",
    description: "Our cinematic alpine example",
    prompt:
      "A cozy cabin beside an alpine lake at sunset, cinematic light, reflections on still water",
    directory: "/demo",
  },
  {
    id: "lettering",
    name: "Words inside an image",
    description: "A café sign with readable lettering",
    prompt:
      'A vintage café sign that says "GOOD MORNING", crisp readable lettering',
    directory: "/demo/lettering",
  },
  {
    id: "detailed",
    name: "More detail, more direction",
    description: "A detailed scene with mist and reflections",
    prompt:
      "A cozy wooden alpine cabin, amber windows, mist over a still glacial lake, snow-capped peaks, dusk reflections, cinematic photography",
    directory: "/demo/detailed",
  },
  {
    id: "simple",
    name: "Just three words",
    description: "A simpler cabin, lake and sunset",
    prompt: "cabin lake sunset",
    directory: "/demo/simple",
  },
  {
    id: "cats",
    name: "Can it count?",
    description: "Three cats, one sofa",
    prompt: "three cats on a sofa",
    directory: "/demo/cats",
  },
  {
    id: "woodblock",
    name: "A different visual language",
    description: "Indigo woodblock art on textured paper",
    prompt:
      "An alpine cabin beside a lake, Japanese woodblock print, indigo ink, textured paper",
    directory: "/demo/woodblock",
  },
  {
    id: "winter",
    name: "Reimagine a reference",
    description: "A prerecorded snowy winter interpretation",
    prompt: "Turn this alpine cabin scene into a snowy winter morning",
    directory: "/demo/winter",
    reference: "/demo/final.webp",
  },
];
const normalize = (prompt: string) =>
  prompt.trim().replace(/\s+/g, " ").toLowerCase();
export function getPromptPreset(prompt: string): PromptPreset | undefined {
  return promptPresets.find((p) => normalize(p.prompt) === normalize(prompt));
}
export function demoAssets(prompt: string) {
  const preset = getPromptPreset(prompt);
  const directory = preset?.directory || "/demo";
  return {
    preset,
    directory: demoAssetUrl(directory),
    image: demoAssetUrl(`${directory}/final.webp`),
    frame: (step: number) =>
      demoAssetUrl(
        `${directory}/frame-${Math.min(24, Math.max(1, Math.round(step)))}.webp`,
      ),
  };
}
