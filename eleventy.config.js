import { IdAttributePlugin } from "@11ty/eleventy";
import { feedPlugin } from "@11ty/eleventy-plugin-rss";
import pluginSyntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import pluginNavigation from "@11ty/eleventy-navigation";
import EleventyVitePlugin from "@11ty/eleventy-plugin-vite";
import { eleventyImageTransformPlugin } from "@11ty/eleventy-img";
import * as cheerio from 'cheerio';

import pluginFilters from "./_config/filters.js";
import path from "path";

import * as fs from "fs";
import postcss from "postcss";
import atImport from "postcss-import";
import cssnano from 'cssnano';
import defaultPreset from "cssnano-preset-default";
import { generate } from "critical";
import tinyHTML from '@sardine/eleventy-plugin-tinyhtml';

/** @param {import("@11ty/eleventy").UserConfig} eleventyConfig */
export default async function (eleventyConfig) {
	// Drafts, see also _data/eleventyDataSchema.js
	eleventyConfig.addPreprocessor("drafts", "*", (data, content) => {
		if (data.draft && process.env.ELEVENTY_RUN_MODE === "build") {
			return false;
		}
	});

	// Copy the contents of the `public` folder to the output folder
	// For example, `./public/css/` ends up in `_site/css/`
	eleventyConfig
		.addPassthroughCopy({
			"./public/": "/"
		})
		.addPassthroughCopy("./content/feed/pretty-atom-feed.xsl");

	// Run Eleventy when these files change:
	// https://www.11ty.dev/docs/watch-serve/#add-your-own-watch-targets

	// Watch images for the image pipeline.
	eleventyConfig.addWatchTarget("content/**/*.{svg,webp,png,jpg,jpeg,gif}");

	// Per-page bundles, see https://github.com/11ty/eleventy-plugin-bundle
	// Adds the {% css %} paired shortcode
	eleventyConfig.addBundle("css", {
		toFileDirectory: "dist",
	});
	// Adds the {% js %} paired shortcode
	eleventyConfig.addBundle("js", {
		toFileDirectory: "dist",
	});

	// Official plugins
	eleventyConfig.addPlugin(pluginSyntaxHighlight, {
		preAttributes: { tabindex: 0 }
	});
	eleventyConfig.addPlugin(pluginNavigation);

	eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
		outputDir: "_site/img",
		widths: ["150", "300", "600", "900", "1200", "auto"],
		formats: ["webp", "avif", "jpeg"],
		htmlOptions: {
			imgAttributes: {
				loading: "lazy",
				decosing: "async"
			}
		}
	})

	eleventyConfig.addPlugin(feedPlugin, {
		type: "atom", // or "rss", "json"
		outputPath: "/feed/feed.xml",
		stylesheet: "pretty-atom-feed.xsl",
		templateData: {
			eleventyNavigation: {
				key: "Feed",
				order: 4
			}
		},
		collection: {
			name: "post",
			limit: 10,
		},
		metadata: {
			language: "en",
			title: "Toby's Blog",
			subtitle: "This is a longer description about your blog.",
			base: "https://shapins.ky/",
			author: {
				name: "Tobias Shapinsky"
			}
		}
	});

	// Filters
	eleventyConfig.addPlugin(pluginFilters);

	eleventyConfig.addPlugin(IdAttributePlugin, {
		// by default we use Eleventy’s built-in `slugify` filter:
		slugify: eleventyConfig.getFilter("slugify"),
		selector: "h1,h2,h3,h4,h5,h6", // default
	});

	eleventyConfig.addShortcode("currentBuildDate", () => {
		return (new Date()).toISOString();
	});

	eleventyConfig.addShortcode("join", path.join);

	eleventyConfig.addPairedShortcode("gallery", function (content, caption = "") {
		var figure_classes = "kg-card kg-gallery-card kg-width-wide";
		var figcaption = "";
		if (caption != "") {
			figure_classes += " kg-card-hascaption";
			figcaption = `<figcaption><p><span style="white-space: pre-wrap;">${caption}</span></p></figcaption>`
		}
		return `<figure class="${figure_classes}">
		<div class="kg-gallery-container">
		${content}
		${figcaption}
		</div>
		</figure>`
	});

	eleventyConfig.addPairedShortcode("galleryRow", function (content) {
		return `<div class="kg-gallery-row">
		${content}
		</div>`;
	});

	eleventyConfig.addShortcode("relativePath", function (filePath, page=undefined) {
		if(page === undefined) {
			page = this.page;
		}
		const relativePath = path.join("/", path.relative("content",path.join(path.dirname(page.inputPath), filePath)));
		return relativePath;
	});

	eleventyConfig.on("eleventy.before", ({ }) => {
		const css = fs.readFileSync("style/main.css", "utf8");
		const css_dest = path.join("public", "css", "main.css");
		const css_map = `${css_dest}.map`
		postcss([cssnano({ preset: defaultPreset() })])
			.use(atImport({
				path: ["./node_modules",
					"./style"
				]
			}))
			.process(css, {
				from: "style/main.css",
				to: "css/main.css",
				"map": { inline: false }
			}).then((result) => {
				if (fs.existsSync(css_dest)) {
					const current_contents = fs.readFileSync(css_dest);
					if (current_contents != result.css) {
						console.log("changed css");
						fs.writeFileSync(css_dest, result.css);
					}
				}
				if (fs.existsSync(css_map)) {
					const current_contents = fs.readFileSync(css_map);
					if (current_contents != result.map.toString()) {
						console.log("changed map");
						fs.writeFileSync(css_map, result.map.toString());
					}
				}
			});
	});

	eleventyConfig.addTransform("image-gallery", function (content) {
		if (this.page.outputFileExtension != "html") {
			return content;
		}
		const $ = cheerio.load(content, {}, true);
		$("div.kg-gallery-row").each((index, div) => {
			let pictures = [];
			let totalAspect = 0;
			$(div).find('picture').each((index, picture) => {
				const img = $(picture).find('img').first();
				const aspect = parseFloat(img.attr('width')) / parseFloat(img.attr('height'));
				pictures.push({
					picture,
					aspect
				});
				$(picture).wrapAll(`<div class="kg-gallery-image" style="flex: ${aspect} 1 0%;"></div>`)
				totalAspect += aspect;
			});
			pictures.forEach(({picture, aspect}) => {
				const widthRatio = aspect / totalAspect;
				const sizes = `auto, (min-width: 1380px) calc((1200px - (1.2rem * ${pictures.length - 1})) * ${widthRatio}), (min-width: 850) calc((94vw - (1.2rem * ${pictures.length - 1})) * ${widthRatio}), calc((88vw - (1.2rem * ${pictures.length - 1})) * ${widthRatio})`
				$(picture).find('img, source').attr('sizes', sizes);
				const img = $(picture).find('img').first();
				const srcset = $(img).attr('srcset');
				const src = srcset.split(",").map((value) => {
					let [src, width] =  value.trim().split(" ");
					return {
						src, 
						width: parseInt(width.substring(0, width.length - 1))
					};
				}).sort((a, b) => {
					return b.width - a.width;
				})[0];
				$(img).attr(src, src.src);
			});
		});
		$("div.kg-gallery-container").each((index, element) => {
			$(element).children().remove('p');
		});
		return $.html();
	});


	eleventyConfig.addPlugin(tinyHTML);
	eleventyConfig.addPlugin(EleventyVitePlugin);

	eleventyConfig.addTransform("critical-css", async function (content) {
		process.setMaxListeners(20);
		if (this.page.outputFileExtension != "html") {
			return content;
		}
		const result = await generate({
			base: "_site/",
			html: content,
			assetPaths: ["_site/", "public/"],
			inline: true,
			dimensions: [
				{
					width: 360,
					height: 800
				},
				{
					width: 900,
					height: 500
				},
				{
					width: 1300,
					height: 900
				}
			]
		});
		return result.html;
	});
};

export const config = {
	// Control which files Eleventy will process
	// e.g.: *.md, *.njk, *.html, *.liquid
	templateFormats: [
		"md",
		"njk",
		"html",
		"liquid",
		"11ty.js",
	],

	// Pre-process *.md files with: (default: `liquid`)
	markdownTemplateEngine: "njk",

	// Pre-process *.html files with: (default: `liquid`)
	htmlTemplateEngine: "njk",

	// These are all optional:
	dir: {
		input: "content",          // default: "."
		includes: "../_includes",  // default: "_includes" (`input` relative)
		data: "../_data",          // default: "_data" (`input` relative)
		output: "_site"
	},

	// -----------------------------------------------------------------
	// Optional items:
	// -----------------------------------------------------------------

	// If your site deploys to a subdirectory, change `pathPrefix`.
	// Read more: https://www.11ty.dev/docs/config/#deploy-to-a-subdirectory-with-a-path-prefix

	// When paired with the HTML <base> plugin https://www.11ty.dev/docs/plugins/html-base/
	// it will transform any absolute URLs in your HTML to include this
	// folder name and does **not** affect where things go in the output folder.

	// pathPrefix: "/",
};