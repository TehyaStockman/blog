import { IdAttributePlugin, InputPathToUrlTransformPlugin, HtmlBasePlugin } from "@11ty/eleventy";
import { feedPlugin } from "@11ty/eleventy-plugin-rss";
import pluginSyntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import pluginNavigation from "@11ty/eleventy-navigation";
import { eleventyImageTransformPlugin } from "@11ty/eleventy-img";
import EleventyVitePlugin from "@11ty/eleventy-plugin-vite";
import * as cheerio from 'cheerio';

import pluginFilters from "./_config/filters.js";
import image from "@11ty/eleventy-img";
import createImage from "@11ty/eleventy-img";
import path from "path";

/** @param {import("@11ty/eleventy").UserConfig} eleventyConfig */
export default async function(eleventyConfig) {
	// Drafts, see also _data/eleventyDataSchema.js
	eleventyConfig.addPreprocessor("drafts", "*", (data, content) => {
		if(data.draft && process.env.ELEVENTY_RUN_MODE === "build") {
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
	eleventyConfig.addPlugin(HtmlBasePlugin);
	eleventyConfig.addPlugin(InputPathToUrlTransformPlugin);

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
			name: "posts",
			limit: 10,
		},
		metadata: {
			language: "en",
			title: "Blog Title",
			subtitle: "This is a longer description about your blog.",
			base: "https://example.com/",
			author: {
				name: "Your Name"
			}
		}
	});

	// Image optimization: https://www.11ty.dev/docs/plugins/image/#eleventy-transform
	eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
		// Output formats for each image.
		formats: ["avif", "webp", "auto"],

		widths: ["auto"],

		failOnError: false,
		htmlOptions: {
			imgAttributes: {
				// e.g. <img loading decoding> assigned on the HTML tag will override these values.
				loading: "lazy",
				decoding: "async",
			}
		},

		sharpOptions: {
			animated: true,
		},
	});

	// Filters
	eleventyConfig.addPlugin(pluginFilters);

	eleventyConfig.addPlugin(IdAttributePlugin, {
		// by default we use Eleventy’s built-in `slugify` filter:
		// slugify: eleventyConfig.getFilter("slugify"),
		// selector: "h1,h2,h3,h4,h5,h6", // default
	});

	eleventyConfig.addShortcode("currentBuildDate", () => {
		return (new Date()).toISOString();
	});

	// Features to make your build faster (when you need them)

	// If your passthrough copy gets heavy and cumbersome, add this line
	// to emulate the file copy on the dev server. Learn more:
	// https://www.11ty.dev/docs/copy/#emulate-passthrough-copy-during-serve

	// eleventyConfig.setServerPassthroughCopyBehavior("passthrough");

    eleventyConfig.addPlugin(EleventyVitePlugin, {
		viteOptions: {
			build: {
				minify: 'terser',
				cssMinify: 'esbuild'
			},
			resolve: {
				alias: {
					"/node_modules": path.resolve(".", "node_modules"),
					"/style": path.resolve(".", "style"),
				}
			}
		}
	});

	eleventyConfig.addPassthroughCopy("img");

	eleventyConfig.addPairedShortcode("gallery", function(content, caption = "") {
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

	eleventyConfig.addPairedShortcode("galleryRow", function(content) {
		return `<div class="kg-gallery-row">
		${content}
		</div>`;
	});

	eleventyConfig.addAsyncShortcode("galleryImage", async function(imagePath, alt="") {
		var metadata = await image(path.join(path.dirname(this.page.inputPath), imagePath), {
			formats: ["avif", "webp", "jpeg"],
			widths: ["auto", "600", "1000"]
		});
		let imageAttributes = {
			alt,
			sizes: "(max-width: 720px) 720px",
			loading: "lazy",
			decoding: "async",
			"eleventy:ignore": true,
			fallback: "largest"
		}
		let largestImage = metadata.jpeg[metadata.jpeg.length - 1];

		// console.log(metadata);
		let aspectRatio = largestImage.width / largestImage.height;
		var image_element = image.generateHTML(metadata, imageAttributes);
		const $ = cheerio.load(image_element);
		$("img").attr("src", largestImage.url);
		return `<div class="kg-gallery-image" style="flex: ${aspectRatio} 1 0%;">
		${$.html()}</div>`;
	});

	eleventyConfig.addAsyncShortcode("postImage", async function(imagePath, alt) {
		var metadata = await image(path.join(path.dirname(this.page.inputPath), imagePath), {
			widths: ["300", "600", "1200", "auto"],
			formats: ["avif", "webp", "auto"],
		});
		let imageAttributes = {
			alt,
			sizes: "(min-width: 961px) 75vw, 88vw",
			decoding: "async",
			class:"kg-image",
			"eleventy:ignore": true
		};
		return image.generateHTML(metadata, imageAttributes);
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