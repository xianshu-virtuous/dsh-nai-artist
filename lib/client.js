window.__ModuleLoader__.load({
	id: "@dsh-external/dsh-nai-artist",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		//#region \0nai-artist-css:F:\dsh\dsh-nai-artist\src\client\PaintToolCard.module.css.mjs
		const css$1 = ".q82xIa_card{background:var(--dsh-surface,#1c1e26);border:1px solid var(--dsh-border,#2e3140);border-radius:12px;max-width:480px;margin:6px 0;overflow:hidden}.q82xIa_image{object-fit:contain;background:#101216;width:100%;max-height:560px;display:block}.q82xIa_caption{color:var(--dsh-fg-muted,#9aa0b4);flex-direction:column;gap:4px;padding:8px 12px;font-size:12px;line-height:1.5;display:flex}.q82xIa_model{color:var(--dsh-accent,#6ea8ff);font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-weight:600}.q82xIa_prompt{text-overflow:ellipsis;white-space:nowrap;text-align:left;direction:ltr;unicode-bidi:plaintext;overflow:hidden}.q82xIa_error{color:#ff7a8a;white-space:pre-wrap;word-break:break-word;padding:10px 12px;font-size:13px}.q82xIa_running{color:var(--dsh-fg-muted,#9aa0b4);padding:12px;font-size:13px;animation:1.4s ease-in-out infinite q82xIa_nai-pulse}@keyframes q82xIa_nai-pulse{0%,to{opacity:1}50%{opacity:.45}}";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"@dsh-external/dsh-nai-artist/PaintToolCard.module.css\"]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh-external/dsh-nai-artist";
			tag.dataset.pluginCss = "@dsh-external/dsh-nai-artist/PaintToolCard.module.css";
			tag.textContent = css$1;
			document.head.appendChild(tag);
		}
		var PaintToolCard_module_css_default = {
			"card": "q82xIa_card",
			"caption": "q82xIa_caption",
			"nai-pulse": "q82xIa_nai-pulse",
			"image": "q82xIa_image",
			"model": "q82xIa_model",
			"prompt": "q82xIa_prompt",
			"running": "q82xIa_running",
			"error": "q82xIa_error"
		};
		//#endregion
		//#region src/client/PaintToolCard.tsx
		/** Parse the `[paint-result]` block emitted by the paint tool's render. */
		function parsePaintResult(text) {
			if (!text.includes("[paint-result]")) return null;
			const meta = {};
			const url = /url:\s*(\/api\/dsh-nai-artist\/gallery\/[\w.-]+\.png)/u.exec(text);
			if (url !== null) meta.url = url[1];
			const model = /^model:\s*(.+)$/mu.exec(text);
			if (model !== null) meta.model = model[1].trim();
			const prompt = /^prompt:\s*(.+)$/mu.exec(text);
			if (prompt !== null) meta.prompt = prompt[1].trim();
			return meta;
		}
		function truncate(text, max) {
			return text.length <= max ? text : `${text.slice(0, max)}…`;
		}
		function PaintToolCard({ block }) {
			if ("kind" in block && block.kind === "tool-result") {
				const text = block.content.filter((content) => content.type === "text").map((content) => content.text).join("\n");
				const meta = parsePaintResult(text);
				if (meta?.url !== void 0) return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("figure", {
					className: PaintToolCard_module_css_default.card,
					"data-paint-result": true,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("img", {
						className: PaintToolCard_module_css_default.image,
						src: meta.url,
						alt: "paint result"
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("figcaption", {
						className: PaintToolCard_module_css_default.caption,
						children: [meta.model !== void 0 && meta.model !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: PaintToolCard_module_css_default.model,
							children: meta.model
						}), meta.prompt !== void 0 && meta.prompt !== "" && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: PaintToolCard_module_css_default.prompt,
							title: meta.prompt,
							children: truncate(meta.prompt, 160)
						})]
					})]
				});
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					className: `${PaintToolCard_module_css_default.card} ${PaintToolCard_module_css_default.error}`,
					"data-paint-error": true,
					children: text !== "" ? text : "绘画失败（无结果）"
				});
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: `${PaintToolCard_module_css_default.card} ${PaintToolCard_module_css_default.running}`,
				"data-paint-running": true,
				children: "🎨 绘画中…"
			});
		}
		//#endregion
		//#region \0nai-artist-css:F:\dsh\dsh-nai-artist\src\client\PaintEntryButton.module.css.mjs
		const css = ".T0yx9W_button{border:1px solid var(--dsh-border,#2e3140);background:var(--dsh-surface,#1c1e26);width:32px;height:32px;color:var(--dsh-fg,#e6e8ef);cursor:pointer;border-radius:8px;justify-content:center;align-items:center;font-size:16px;line-height:1;transition:background .15s,transform .1s;display:inline-flex}.T0yx9W_button:hover{background:var(--dsh-hover,#262a36);transform:scale(1.05)}.T0yx9W_button:active{transform:scale(.95)}.T0yx9W_overlay{z-index:9999;background:#00000073;justify-content:flex-end;display:flex;position:fixed;inset:0}.T0yx9W_drawer{background:var(--dsh-surface,#17181f);border-left:1px solid var(--dsh-border,#2e3140);flex-direction:column;width:min(680px,92vw);height:100%;animation:.18s ease-out T0yx9W_nai-drawer-in;display:flex}@keyframes T0yx9W_nai-drawer-in{0%{opacity:.6;transform:translate(48px)}to{opacity:1;transform:translate(0)}}.T0yx9W_bar{border-bottom:1px solid var(--dsh-border,#2e3140);justify-content:space-between;align-items:center;padding:10px 14px;display:flex}.T0yx9W_title{color:var(--dsh-fg,#e6e8ef);font-size:14px;font-weight:600}.T0yx9W_close{color:var(--dsh-fg-muted,#9aa0b4);cursor:pointer;background:0 0;border:none;border-radius:6px;padding:4px 8px;font-size:14px}.T0yx9W_close:hover{background:var(--dsh-hover,#262a36);color:var(--dsh-fg,#e6e8ef)}.T0yx9W_frame{background:#101216;border:none;flex:1;width:100%}";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=\"@dsh-external/dsh-nai-artist/PaintEntryButton.module.css\"]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "@dsh-external/dsh-nai-artist";
			tag.dataset.pluginCss = "@dsh-external/dsh-nai-artist/PaintEntryButton.module.css";
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var PaintEntryButton_module_css_default = {
			"nai-drawer-in": "T0yx9W_nai-drawer-in",
			"title": "T0yx9W_title",
			"frame": "T0yx9W_frame",
			"button": "T0yx9W_button",
			"close": "T0yx9W_close",
			"drawer": "T0yx9W_drawer",
			"bar": "T0yx9W_bar",
			"overlay": "T0yx9W_overlay"
		};
		//#endregion
		//#region src/client/PaintEntryButton.tsx
		/** Quick entry for the NAI Artist workbench: a button that opens the WebUI in a side drawer. */
		function PaintEntryButton() {
			const [open, setOpen] = (0, react.useState)(false);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
				className: PaintEntryButton_module_css_default.button,
				type: "button",
				title: "打开 NAI 绘画工作台",
				"aria-label": "打开 NAI 绘画工作台",
				onClick: () => setOpen(true),
				children: "🎨"
			}), open && /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: PaintEntryButton_module_css_default.overlay,
				onClick: () => setOpen(false),
				children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: PaintEntryButton_module_css_default.drawer,
					role: "dialog",
					"aria-label": "NAI 绘画工作台",
					onClick: (event) => event.stopPropagation(),
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: PaintEntryButton_module_css_default.bar,
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: PaintEntryButton_module_css_default.title,
							children: "NAI 绘画工作台"
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							className: PaintEntryButton_module_css_default.close,
							type: "button",
							onClick: () => setOpen(false),
							"aria-label": "关闭",
							children: "✕"
						})]
					}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("iframe", {
						className: PaintEntryButton_module_css_default.frame,
						src: "/nai-artist",
						title: "NAI Artist"
					})]
				})
			})] });
		}
		//#endregion
		//#region src/client/index.ts
		const inject = ["slots", "conversation"];
		function apply(ctx) {
			ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
				name: "tool.call.toolview",
				key: "paint"
			}, PaintToolCard));
			ctx.slots.inject("conversation.input.right", () => ctx.slots.register({
				name: "conversation.input.right",
				id: "nai-artist-entry",
				order: 20
			}, PaintEntryButton));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
