const fs = require("fs");
const puppeteer = require("puppeteer");
const crypto = require("crypto");

const RAM_VALUES = [4,8,12,16,32,64];
const SSD_VALUES = [128,256,512,1024,2048];

function hash(c){return crypto.createHash("md5").update(c).digest("hex");}

function normalizePrice(str){
  if(!str) return 0;
  str=str.toLowerCase();

  if(str.includes("tr")){
    let [a,b]=str.split("tr");
    return (parseInt(a)||0)*1e6 + (parseInt(b)||0)*1e5;
  }

  return parseInt(str.replace(/[^\d]/g,""))||0;
}

function slugify(str){
  return str.toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g,"")
  .replace(/[^a-z0-9]+/g,"-")
  .replace(/^-+|-+$/g,"");
}

function normalizeText(s){
  return s.toLowerCase().replace(/[^a-z0-9]/g," ");
}

// ===== CATEGORY =====
function detectCategory(name){
  name=name.toLowerCase();

  if(name.match(/dell|hp|lenovo|asus|acer|macbook/)) return "laptop";
  if(name.includes("camera")) return "camera";
  if(name.includes("đèn")||name.includes("solar")) return "solar";
  if(name.includes("máy in")||name.includes("printer")) return "printer";

  return "other";
}

// ===== LAPTOP PARSE =====
function detectRAM(name){
  let text=normalizeText(name);

  let m=text.match(/ram\s*(\d+)/);
  if(m && RAM_VALUES.includes(+m[1])) return +m[1];

  let all=text.match(/(\d+)\s?gb/g)||[];
  for(let x of all){
    let v=parseInt(x);
    if(RAM_VALUES.includes(v)) return v;
  }
  return 0;
}

function detectSSD(name){
  let text=normalizeText(name);

  let m=text.match(/(ssd|nvme)\s*(\d+)/);
  if(m){
    let v=+m[2];
    if(SSD_VALUES.includes(v)) return v;
  }

  let all=text.match(/(\d+)\s?(gb|tb)/g)||[];
  for(let x of all){
    let n=parseInt(x);
    let size=x.includes("tb")?n*1024:n;
    if(SSD_VALUES.includes(size)) return size;
  }
  return 0;
}

function detectCPU(name){
  name=name.toLowerCase();

  let intel=name.match(/i[3579][-\s]?\d{4,5}[a-z0-9]*/);
  if(intel) return intel[0].toUpperCase();

  let ryzen=name.match(/r[3579]\s?\d{4,5}[a-z0-9]*/);
  if(ryzen) return ryzen[0].toUpperCase();

  if(name.includes("m1")) return "Apple M1";
  if(name.includes("m2")) return "Apple M2";

  return "";
}

function detectBrand(name){
  name=name.toLowerCase();
  if(name.includes("dell")) return "Dell";
  if(name.includes("hp")) return "HP";
  if(name.includes("lenovo")) return "Lenovo";
  if(name.includes("asus")) return "Asus";
  if(name.includes("acer")) return "Acer";
  if(name.includes("macbook")) return "Apple";
  return "";
}

// ===== MAIN =====
(async()=>{
  const txt = fs.readFileSync("links.txt","utf8");
  const newHash = hash(txt);

  if(fs.existsSync("links.hash")){
    if(fs.readFileSync("links.hash","utf8")===newHash){
      console.log("Không đổi 👍");
      return;
    }
  }

  const links = txt.split("\n").filter(x=>x.trim());

  const browser = await puppeteer.launch({
  args: ["--no-sandbox", "--disable-setuid-sandbox"]
});
  const page = await browser.newPage();

  let all=[];

  for(let link of links){
    await page.goto(link,{waitUntil:"networkidle2"});
    await page.waitForTimeout(3000);

    let data = await page.evaluate(()=>{
      let arr=[];
      document.querySelectorAll("a").forEach(el=>{
        let name=el.innerText;
        let img=el.querySelector("img")?.src;

        if(name && img){
          arr.push({
            name,
            img,
            raw:name,
            link:el.href
          });
        }
      });
      return arr;
    });

    all=all.concat(data);
  }

  all = all.map(p=>{
    let price = normalizePrice(p.raw);
    let category = detectCategory(p.name);

    let base = {
      name:p.name,
      slug:slugify(p.name),
      img:p.img,
      link:p.link,
      price,
      category
    };

    if(category==="laptop"){
      return {
        ...base,
        brand:detectBrand(p.name),
        cpu:detectCPU(p.name),
        ram:detectRAM(p.name),
        ssd:detectSSD(p.name)
      };
    }

    return base;
  });

  fs.writeFileSync("products.json",JSON.stringify(all,null,2));
  fs.writeFileSync("links.hash",newHash);

  await browser.close();

  console.log("✅ Done");
  
  const fs = require("fs");

	fs.writeFileSync("products.json", JSON.stringify(all,null,2));
})();
