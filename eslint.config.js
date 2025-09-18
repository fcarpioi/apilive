// 📌 Crea el archivo eslint.config.js en la raíz del proyecto
export default [
    {
      ignores: ["node_modules/", "dist/", "functions/lib/", "functions/node_modules/"],
    },
    {
      languageOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      linterOptions: {
        reportUnusedDisableDirectives: true,
      },
      rules: {
        "no-unused-vars": "warn",
        "no-console": "off",
      },
    },
  ];