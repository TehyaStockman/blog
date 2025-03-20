import { IdAttributePlugin } from "@11ty/eleventy";
import { feedPlugin } from "@11ty/eleventy-plugin-rss";
import pluginSyntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import pluginNavigation from "@11ty/eleventy-navigation";
import EleventyVitePlugin from "@11ty/eleventy-plugin-vite";
import * as cheerio from 'cheerio';

import pluginFilters from "./_config/filters.js";
import image from "@11ty/eleventy-img";
import path from "path";

import * as fs from "fs";
import postcss from "postcss";
import atImport from "postcss-import";
import cssnano from 'cssnano';
import defaultPreset from "cssnano-preset-default";
import { generate } from "critical";
import tinyHTML from '@sardine/eleventy-plugin-tinyhtml';

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


    eleventyConfig.addPlugin(EleventyVitePlugin);

	eleventyConfig.addPlugin(tinyHTML);

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
		console.log("Gallery Row");
		const $ = cheerio.load(content, null, false);
		const gallery_images = $("div.kg-gallery-image");
		var totalAspect = 0;
		var images = [];
		gallery_images.each(function() {
			const style = $(this).attr("style");
			const flexMatch = style?.match(/flex:\s*([0-9\.]+)/);
			if(flexMatch) {
				const aspectRatio = parseFloat(flexMatch[1])
				totalAspect += aspectRatio;
				images.push({
					element: this,
					aspectRatio: aspectRatio});
			}
		});
		
		images.forEach(function (image) {
			const aspectRatio = image.aspectRatio;
			const widthRatio = aspectRatio / totalAspect;
			const sizes = `auto, (min-width: 1380px) calc((1200px - (1.2rem * ${gallery_images.length - 1})) * ${widthRatio}), (min-width: 850) calc((94vw - (1.2rem * ${gallery_images.length - 1})) * ${widthRatio}), calc((88vw - (1.2rem * ${gallery_images.length - 1})) * ${widthRatio})`
			$(image.element).find('img, source').attr('sizes', sizes);
		});

		return `<div class="kg-gallery-row">
		${$.html()}
		</div>`;
	});

	eleventyConfig.addAsyncShortcode("galleryImage", async function(imagePath, alt="") {
		imagePath = path.join(path.dirname(this.page.inputPath), imagePath);
		const metadata = await image(imagePath, {
			formats: ["avif", "webp", "jpeg"],
			widths: ["auto","150", "300", "600", "900"],
			outputDir: "./_site/img",
			useCache: true,
			cacheOptions: {
				directory: ".cache"
			}
		});
		const imageAttributes = {
			alt,
			loading: "lazy",
			decoding: "async",
		}
		const generatedImageHTML = image.generateHTML(metadata, imageAttributes);
		const $ = cheerio.load(generatedImageHTML, null, false);
		const imgElement = $('img');
		const imgSrc = imgElement.attr('src');
		const extension = imgSrc.match(/\.([a-zA-Z0-9]+)$/)[1];
		
		let largestImage = metadata[extension][metadata[extension].length - 1];

		let aspectRatio = largestImage.width / largestImage.height;
		imgElement.attr("src", largestImage.url);
		return `<div class="kg-gallery-image" style="flex: ${aspectRatio} 1 0%;">
		${$.html()}</div>`;
	});

	eleventyConfig.addAsyncShortcode("postImage", async function(page, imagePath, alt) {
		const isFeature = page == this.page;
		imagePath = path.join(path.dirname(page.inputPath), imagePath);
		var metadata = await image(imagePath, {
			widths: ["300", "600", "900", "1200", "auto"],
			formats: ["avif", "webp", "auto"],
			outputDir: "./_site/img",
			useCache: true,
			cacheOptions: {
				directory: ".cache"
			}
		});
		let imageAttributes = {
			alt,
			sizes: "(min-width: 1380px) 1200px, (min-width: 980px) calc(73.42vw + 201px), 88.03vw",
			decoding: "async",
			class:"kg-image",
		};
		if (!isFeature) {
			imageAttributes["loading"] = "lazy";
			imageAttributes["sizes"]  = "auto";
		}
		return image.generateHTML(metadata, imageAttributes);
	});

	eleventyConfig.on("eleventy.before", ({}) => {
		const css = fs.readFileSync("style/main.css", "utf8");
		const css_dest = path.join("public", "css", "main.css");
		const css_map = `${css_dest}.map`
		postcss([cssnano({preset: defaultPreset()})])
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
					if(current_contents != result.css) {
						console.log("changed css");
						fs.writeFileSync(css_dest, result.css);
					}
				}
				if (fs.existsSync(css_map)) {
					const current_contents = fs.readFileSync(css_map);
					if(current_contents != result.map.toString()) {
						console.log("changed map");
						fs.writeFileSync(css_map, result.map.toString());
					}
				}
			});
	});

	eleventyConfig.addTransform("critical-css", async function(content) {
		process.setMaxListeners(20);
		if(this.page.outputFileExtension != "html") {
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