import path from "path"
import image from "@11ty/eleventy-img";
function generateExcerpt(rawInput) {
    // console.log(typeof rawInput);
    return rawInput.substring(0,120);
}

function canonical(data) {
    if (data.sharing?.canonical) {
        return data.sharing.canonical;
    }
    return new URL(data.page.url,data.metadata.url).toString();   
}

function pageType(data) {
    if(data.sharing?.type) {
        return data.sharing.type;
    }
    if (!data.layout) {
        return "website";
    }
    switch(path.basename(data.layout, path.extname(data.layout))) {
        case "post": return "article";
        case "project": return "website";
        default: return "website";
    }
}

function description(data) {
    if (data.sharing?.description) {
        return data.sharing.description;
    }
    if (pageType(data) == "website") {
        return data.metadata.description;
    }
    return generateExcerpt(data.page.rawInput);
}

function title(data) {
    if (data.sharing?.title) {
        return data.sharing.title;
    }
    if(data.title) {
        return data.title;
    }
    return data.metadata.title;
}

async function makeImage(data) {
    if(data.sharing?.image) {
        return data.sharing.image;
    }
    let srcImage = path.join('public', data.metadata.favicon);
    let fit = "contain";
    if(data.feature_image) {
        srcImage = path.join(path.dirname(data.page.inputPath), data.feature_image);
    }
    const metadata = await image(srcImage, {
        widths: ["1200"],
        formats: ["jpeg"],
        outputDir: "_site/img",
        sharpOptions: {
            width: 1200,
            height: 630
        },
        transform: async (sharp) => {
            // console.log(sharp);
            var hExtend = 0;
            var vExtend = 0;
            // let buffer = await sharp.resize(1200,630, {
            //     fit: "cover"
            // }).png().toBuffer({ resolveWithObject: true });
            let buffer = await sharp.png().toBuffer({resolveWithObject: true});
            // console.log("initial:", buffer.info);
            hExtend = 1200 - buffer.info.width;
            vExtend = 630 - buffer.info.height;
            
            // console.log("vExtend", vExtend);
            // console.log("hExtend", hExtend);
            buffer = await sharp.extend({
                top: Math.max(Math.ceil(vExtend / 2.0), 0),
                left: Math.max(Math.ceil(hExtend / 2.0), 0),
                bottom: Math.max(Math.floor(vExtend / 2.0), 0),
                right: Math.max(Math.floor(hExtend / 2.0), 0)
            }).png().toBuffer({ resolveWithObject: true });
            // console.log("extended:", buffer.info);
            if(!(buffer.info.width == 1200 && buffer.info.height == 630)) {
                buffer = await sharp.resize(1200, 630, {
                    fit: "cover"
                }).png().toBuffer({resolveWithObject: true});
                // console.log("resized:", buffer.info);
            }
            // .extract({
            //     top: Math.abs(Math.min(Math.ceil(vExtend / 2.0), 0)),
            //     left: Math.abs(Math.min(Math.ceil(hExtend / 2.0), 0)),
            //     width: 1200,
            //     height: 630
            // }).metadata();
            // console.log("newMetadata", newMetadata)
        }
    });
    let imageObj = metadata.jpeg[0];
    // console.log(imageObj);
    imageObj.url = imageObj.url
    return imageObj;
}
export default {
        sharing : {
            canonical,
            type: pageType,
            description,
            title,
            image: makeImage
        }
}