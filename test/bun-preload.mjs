Bun.plugin({
  name: "alias-node-test",
  setup(builder) {
    builder.onResolve({ filter: /^node:test$/ }, (args) => {
      return { path: new URL("./shims/node-test-shim.mjs", import.meta.url).href };
    });
  },
});
