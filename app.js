const SUPABASE_URL = "https://mroymnyvijfhutqmqczg.supabase.co";
const SUPABASE_KEY = "sb_publishable_9KcCRtzy9FtTogYIcTmY8Q_g4WmUXsq";

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const grid = document.getElementById("grid");
const upload = document.getElementById("upload");
const bgInput = document.getElementById("bgInput");

const videoViewer = document.getElementById("videoViewer");
const mainVideo = document.getElementById("mainVideo");

let videos = [];
let current = 0;
let cropper = null;
let currentCropImage = null;

// Expose functions globally
window.upload = upload;
window.bgInput = bgInput;
window.prev = prev;
window.next = next;
window.closeViewer = closeViewer;
window.applyCrop = applyCrop;
window.closeCrop = closeCrop;

/* SPLASH + SOUND */
window.addEventListener("click", () => {
  const sound = document.getElementById("splashSound");
  if (sound) sound.play().catch(() => {});
}, { once: true });

setTimeout(() => {
  const splash = document.getElementById("splash");
  if (splash) splash.style.display = "none";
}, 2500);

/* LOAD SAVED BACKGROUND */
if (localStorage.getItem("bg")) {
  document.body.style.backgroundImage = `url(${localStorage.getItem("bg")})`;
}

/* DARKNESS CONTROL */
const overlay = document.getElementById("bg-overlay");
const slider = document.getElementById("darkness");

let savedDark = localStorage.getItem("darkness");
if (savedDark === null) savedDark = "0.5";

overlay.style.background = `rgba(0,0,0,${savedDark})`;
slider.value = savedDark;

slider.oninput = (e) => {
  let val = e.target.value;
  overlay.style.background = `rgba(0,0,0,${val})`;
  localStorage.setItem("darkness", val);
};

/* BACKGROUND PICK + CROP - FIXED */
bgInput.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  
  reader.onload = (event) => {
    const cropModal = document.getElementById("cropModal");
    const cropImage = document.getElementById("cropImage");
    
    cropImage.src = event.target.result;
    cropModal.style.display = "flex";
    
    // Destroy old cropper if exists
    if (cropper) {
      cropper.destroy();
      cropper = null;
    }
    
    // Wait for image to load
    cropImage.onload = () => {
      // Get exact screen dimensions for perfect fit
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      const imageRatio = cropImage.naturalWidth / cropImage.naturalHeight;
      const screenRatio = screenWidth / screenHeight;
      
      cropper = new Cropper(cropImage, {
        aspectRatio: screenRatio,
        viewMode: 1,
        dragMode: 'move',
        autoCropArea: 1,
        responsive: true,
        background: false,
        movable: true,
        zoomable: true,
        scalable: true,
        cropBoxMovable: false,
        cropBoxResizable: false,
        toggleDragModeOnDblclick: false,
        ready: function() {
          // Force crop box to exactly match screen ratio
          const containerData = cropper.getContainerData();
          const cropBoxData = cropper.getCropBoxData();
          cropper.setCropBoxData({
            left: 0,
            top: 0,
            width: containerData.width,
            height: containerData.width / screenRatio
          });
        }
      });
    };
  };
  
  reader.readAsDataURL(file);
  bgInput.value = ""; // Reset input
};

/* APPLY CROP */
function applyCrop() {
  if (!cropper) return;
  
  try {
    const canvas = cropper.getCroppedCanvas({
      width: window.innerWidth,
      height: window.innerHeight
    });
    
    const imgData = canvas.toDataURL("image/jpeg", 0.9);
    document.body.style.backgroundImage = `url(${imgData})`;
    localStorage.setItem("bg", imgData);
    
    closeCrop();
  } catch (err) {
    console.error("Crop error:", err);
    alert("Lỗi khi cắt ảnh: " + err.message);
  }
}

/* CLOSE CROP - FIXED */
function closeCrop() {
  const cropModal = document.getElementById("cropModal");
  cropModal.style.display = "none";
  
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
}

/* THUMBNAIL CREATOR */
async function createThumbnail(file) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = URL.createObjectURL(file);
    
    video.onloadeddata = () => {
      video.currentTime = 1;
    };
    
    video.onseeked = () => {
      const canvas = document.createElement("canvas");
      const ratio = video.videoWidth / video.videoHeight;
      canvas.width = 320;
      canvas.height = 320 / ratio;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(video.src);
      resolve(canvas.toDataURL("image/jpeg", 0.5));
    };
    
    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      resolve(null);
    };
  });
}

/* LOAD VIDEOS FROM SUPABASE */
async function loadVideos() {
  try {
    const { data, error } = await sb
      .from("videos")
      .select("*")
      .order("id", { ascending: false })
      .limit(50);
    
    if (error) throw error;
    videos = data || [];
    render();
  } catch (err) {
    console.error("Load error:", err);
  }
}

/* RENDER GRID */
function render() {
  if (!grid) return;
  grid.innerHTML = "";
  
  videos.forEach((v, i) => {
    if (!v.thumb_url) return;
    
    const div = document.createElement("div");
    div.className = "video-item";
    
    const img = document.createElement("img");
    img.src = v.thumb_url;
    img.className = "thumb";
    img.loading = "lazy";
    img.alt = "Video thumbnail";
    
    div.appendChild(img);
    
    let previewVideo = null;
    
    div.onmouseenter = () => {
      if (previewVideo) return;
      previewVideo = document.createElement("video");
      previewVideo.src = v.video_url;
      previewVideo.muted = true;
      previewVideo.loop = true;
      previewVideo.autoplay = true;
      previewVideo.playsInline = true;
      previewVideo.className = "thumb";
      
      div.innerHTML = "";
      div.appendChild(previewVideo);
      
      previewVideo.play().catch(() => {});
    };
    
    div.onmouseleave = () => {
      if (previewVideo) {
        previewVideo.pause();
        previewVideo = null;
      }
      div.innerHTML = "";
      div.appendChild(img);
    };
    
    div.onclick = () => openViewer(i);
    
    grid.appendChild(div);
  });
}

/* UPLOAD HANDLER */
let queue = Promise.resolve();

upload.onchange = (e) => {
  const files = Array.from(e.target.files);
  for (const file of files) {
    queue = queue.then(() => handleUpload(file));
  }
  upload.value = "";
};

async function handleUpload(file) {
  if (!file.type.startsWith("video/")) {
    alert("Chỉ hỗ trợ file video!");
    return;
  }
  
  const name = Date.now() + "_" + Math.random().toString(36).slice(2);
  const progress = document.getElementById("uploadProgress");
  const text = document.getElementById("uploadText");
  
  progress.style.display = "block";
  text.style.display = "block";
  progress.value = 0;
  text.innerText = "0%";
  
  try {
    text.innerText = "Đang tạo ảnh đại diện...";
    progress.value = 10;
    
    const thumb = await createThumbnail(file);
    if (!thumb) throw new Error("Không thể tạo thumbnail");
    
    const thumbBlob = await (await fetch(thumb)).blob();
    
    await sb.storage.from("thumbs").upload(name + ".jpg", thumbBlob, {
      contentType: "image/jpeg",
      cacheControl: "3600"
    });
    
    progress.value = 40;
    text.innerText = "Đang tải video... (40%)";
    
    await sb.storage.from("videos").upload(name + ".mp4", file, {
      contentType: file.type,
      cacheControl: "3600"
    });
    
    progress.value = 80;
    text.innerText = "Đang lưu thông tin... (80%)";
    
    const videoUrl = sb.storage.from("videos").getPublicUrl(name + ".mp4").data.publicUrl;
    const thumbUrl = sb.storage.from("thumbs").getPublicUrl(name + ".jpg").data.publicUrl;
    
    await sb.from("videos").insert([{ video_url: videoUrl, thumb_url: thumbUrl }]);
    
    progress.value = 100;
    text.innerText = "Hoàn tất! ✅";
    
    setTimeout(() => {
      progress.style.display = "none";
      text.style.display = "none";
    }, 2000);
    
    await loadVideos();
    
  } catch (err) {
    console.error("Upload error:", err);
    text.innerText = "Lỗi: " + err.message;
    alert("Upload thất bại: " + err.message);
    setTimeout(() => {
      progress.style.display = "none";
      text.style.display = "none";
    }, 3000);
  }
}

/* VIDEO VIEWER */
function openViewer(index) {
  if (!videos[index]) return;
  current = index;
  videoViewer.style.display = "flex";
  mainVideo.style.display = "block";
  mainVideo.src = videos[current].video_url;
  mainVideo.load();
  mainVideo.play().catch(() => {});
}

function next() {
  if (!videos.length) return;
  current = (current + 1) % videos.length;
  mainVideo.src = videos[current].video_url;
  mainVideo.load();
  mainVideo.play().catch(() => {});
}

function prev() {
  if (!videos.length) return;
  current = (current - 1 + videos.length) % videos.length;
  mainVideo.src = videos[current].video_url;
  mainVideo.load();
  mainVideo.play().catch(() => {});
}

function closeViewer() {
  mainVideo.pause();
  mainVideo.src = "";
  videoViewer.style.display = "none";
}

/* SWIPE GESTURES */
let touchStartX = 0;
let touchEndX = 0;

videoViewer.addEventListener("touchstart", (e) => {
  touchStartX = e.changedTouches[0].screenX;
});

videoViewer.addEventListener("touchend", (e) => {
  touchEndX = e.changedTouches[0].screenX;
  const diff = touchStartX - touchEndX;
  if (Math.abs(diff) > 50) {
    if (diff > 0) next();
    else prev();
  }
});

/* KEYBOARD CONTROLS */
document.addEventListener("keydown", (e) => {
  if (videoViewer.style.display !== "flex") return;
  if (e.key === "ArrowLeft") prev();
  if (e.key === "ArrowRight") next();
  if (e.key === "Escape") closeViewer();
});

/* INIT */
loadVideos();

// Fix volume slider
const volumeSlider = document.getElementById("volumeSlider");
if (volumeSlider) {
  volumeSlider.value = "0.5";
  mainVideo.volume = 0.5;
  volumeSlider.oninput = (e) => {
    mainVideo.volume = parseFloat(e.target.value);
  };
}
localStorage.setItem("darkness", val);
};
