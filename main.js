const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const snap = document.getElementById('snap');
const context = canvas.getContext('2d');

// Kamerani ishga tushirish
navigator.mediaDevices.getUserMedia({ video: true })
  .then(stream => { video.srcObject = stream; })
  .catch(err => alert("Kamerani ishga tushirib bo'lmadi: " + err));

snap.addEventListener("click", () => {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
});

// PDF saqlash
document.getElementById("savePdf").addEventListener("click", () => {
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF();
  const imgData = canvas.toDataURL("image/jpeg", 1.0);
  pdf.addImage(imgData, 'JPEG', 10, 10, 180, 0);
  pdf.save("scan.pdf");
});

// OpenCV yuklangandan keyin ishlash uchun
function onOpenCvReady() {
  console.log("✅ OpenCV yuklandi!");
  document.getElementById("detectBtn").addEventListener("click", detectDocument);
}

// Hujjat aniqlash funksiyasi
function detectDocument() {
  try {
    // canvasda rasm borligiga ishonch hosil qiling
    if (canvas.width === 0 || canvas.height === 0) {
      alert("Iltimos, avval rasm oling (📷 Rasm olish).");
      return;
    }

    let src = cv.imread(canvas);
    let gray = new cv.Mat();
    let blurred = new cv.Mat();
    let edged = new cv.Mat();

    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edged, 75, 200);

    let contours = new cv.MatVector();
    let hierarchy = new cv.Mat();
    cv.findContours(edged, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    let maxArea = 0;
    let bestApprox = null;

    for (let i = 0; i < contours.size(); i++) {
      let cnt = contours.get(i);
      let peri = cv.arcLength(cnt, true);
      let approx = new cv.Mat();
      cv.approxPolyDP(cnt, approx, 0.02 * peri, true);

      // Faqat 4 nuqtali konturlarni koʻramiz
      if (approx.rows === 4) {
        let area = Math.abs(cv.contourArea(approx));
        if (area > maxArea) {
          maxArea = area;
          // agar oldingi bestApprox mavjud bo'lsa o'chirib tashlang
          if (bestApprox) bestApprox.delete();
          // clone qilib saqlaymiz (asl approxni keyin o'chirish mumkin)
          bestApprox = approx.clone();
        }
      }
      // tozalash
      approx.delete();
      cnt.delete();
    }

    if (bestApprox && bestApprox.rows === 4) {
      // bestApprox.data32S ichida 8 ta butun son bor: [x0,y0,x1,y1,...]
      let pts = Array.from(bestApprox.data32S); // [x0,y0,x1,y1,x2,y2,x3,y3]
      if (pts.length < 8) {
        alert("Topilgan kontur yaroqsiz — nuqtalar yetarli emas.");
      } else {
        // Nuqtalarni [ {x,y}, ... ] ko'rinishida olish
        let points = [
          { x: pts[0], y: pts[1] },
          { x: pts[2], y: pts[3] },
          { x: pts[4], y: pts[5] },
          { x: pts[6], y: pts[7] }
        ];

        // Tartiblash: yuqori-yonalarga qarab (oddiy usul)
        points.sort((a, b) => a.y - b.y);
        let top = points.slice(0, 2).sort((a, b) => a.x - b.x);
        let bottom = points.slice(2, 4).sort((a, b) => a.x - b.x);
        let ordered = [top[0], top[1], bottom[1], bottom[0]];

        // chizish uchun MatVector yaratib push_back qilamiz
        let drawVec = new cv.MatVector();
        drawVec.push_back(bestApprox);
        cv.drawContours(src, drawVec, 0, new cv.Scalar(255, 255, 0, 255), 3);

        // Warping (xohlasaiz qirqish/tekislash)
        let srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, ordered.flatMap(p => [p.x, p.y]));
        // ishchi o'lchamlar — kerak bo'lsa dinamik hisoblang
        let width = 400, height = 600;
        let dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, width, 0, width, height, 0, height]);

        let M = cv.getPerspectiveTransform(srcTri, dstTri);
        let warped = new cv.Mat();
        cv.warpPerspective(src, warped, M, new cv.Size(width, height));

        // Natijani canvasga chiqarish (warp qilingan rasm)
        cv.imshow(canvas, warped);

        // tozalash
        srcTri.delete(); dstTri.delete(); M.delete();
        warped.delete(); drawVec.delete();
      }
    } else {
      alert("Hujjat aniqlanmadi — kontur topilmadi.");
    }

    // delete all
    src.delete(); gray.delete(); blurred.delete(); edged.delete();
    contours.delete(); hierarchy.delete();
    if (bestApprox) bestApprox.delete();
  } catch (err) {
    console.error(err);
    alert("Xatolik yuz berdi: " + err);
  }
}
