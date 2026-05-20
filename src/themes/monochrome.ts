export const monochromeCodeTheme = {
  name: "sentry-monochrome",
  displayName: "Sentry monochrome",
  type: "dark",
  semanticHighlighting: true,
  colors: {
    "editor.background": "#000000",
    "editor.foreground": "#f5f5f5",
    "editor.lineHighlightBackground": "#111111",
    "editor.selectionBackground": "#303030",
    "editorLineNumber.activeForeground": "#fafafa",
    "editorLineNumber.foreground": "#777777",
    "editorGroupHeader.tabsBackground": "#000000",
    "editorGroupHeader.tabsBorder": "#000000",
    focusBorder: "#ffffff",
    "menu.selectionBackground": "#222222",
    "menu.selectionForeground": "#ffffff",
    "scrollbarSlider.background": "#3a3a3a80",
    "scrollbarSlider.hoverBackground": "#62626299",
    "tab.activeBackground": "#000000",
    "tab.activeBorder": "#ffffff",
    "tab.activeForeground": "#fafafa",
    "tab.border": "#000000",
    "titleBar.activeBackground": "#000000",
    "titleBar.activeForeground": "#fafafa",
    "titleBar.border": "#000000",
  },
  tokenColors: [
    {
      name: "Default",
      settings: {
        foreground: "#f5f5f5",
      },
    },
    {
      name: "Comments",
      scope: ["comment", "punctuation.definition.comment", "string.comment"],
      settings: {
        foreground: "#8a8a8a",
        fontStyle: "italic",
      },
    },
    {
      name: "Punctuation",
      scope: ["punctuation", "meta.brace", "meta.delimiter"],
      settings: {
        foreground: "#cfcfcf",
      },
    },
    {
      name: "Keywords",
      scope: [
        "keyword",
        "storage",
        "storage.type",
        "constant.language",
        "support.type.primitive",
      ],
      settings: {
        foreground: "#ffffff",
        fontStyle: "bold",
      },
    },
    {
      name: "Strings",
      scope: ["string", "constant.other.symbol", "markup.inline.raw"],
      settings: {
        foreground: "#ffd166",
      },
    },
    {
      name: "Numbers and constants",
      scope: [
        "constant.numeric",
        "constant.character",
        "variable.other.constant",
      ],
      settings: {
        foreground: "#ffb86c",
      },
    },
    {
      name: "Functions",
      scope: ["entity.name.function", "support.function", "meta.function-call"],
      settings: {
        foreground: "#9ae6b4",
      },
    },
    {
      name: "Types and classes",
      scope: [
        "entity.name.type",
        "entity.name.class",
        "entity.name.interface",
        "support.class",
        "support.type",
      ],
      settings: {
        foreground: "#f8f8f8",
        fontStyle: "bold",
      },
    },
    {
      name: "Variables and properties",
      scope: [
        "variable",
        "variable.parameter",
        "variable.other.property",
        "support.variable.property",
        "meta.object-literal.key",
      ],
      settings: {
        foreground: "#e8e8e8",
      },
    },
    {
      name: "Markup",
      scope: ["entity.name.tag", "markup.heading", "markup.bold"],
      settings: {
        foreground: "#ffffff",
      },
    },
    {
      name: "Inserted",
      scope: ["markup.inserted", "meta.diff.header.to-file"],
      settings: {
        foreground: "#9ae6b4",
      },
    },
    {
      name: "Deleted",
      scope: ["markup.deleted", "meta.diff.header.from-file"],
      settings: {
        foreground: "#ff9a9a",
      },
    },
  ],
} as const;
