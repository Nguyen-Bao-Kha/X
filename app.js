const SUPABASE_URL = "https://mroymnyvijfhutqmqczg.supabase.co";
const SUPABASE_KEY = "sb_publishable_9KcCRtzy9FtTogYIcTmY8Q_g4WmUXsq";
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const grid = document.getElementById("grid");
const upload = document.getElementById("upload");
const bgInput = document.getElementById("bgInput");

let videos = [];
let current = 0;

/* SPLASH AUTO SOUND */
const splashSound = document.getElementById("splashSound");

function playSplashSound() {
    splashSound.play().catch(()=>{
        // fallback nếu browser chặn autoplay
        window.addEventListener("click", ()=>splashSound.play(), { once: true });
    });
}

window.addEventListener("load", playSplashSound);

/* Ẩn splash sau 7 giây */
setTimeout(()=>{
    document.getElementById("splash").style.display="none";
}, 7500);

/* BACKGROUND */
if(localStorage.getItem("bg")){
    document.body.style.backgroundImage = `url(${localStorage.getItem("bg")})`;
    document.body.style.backgroundSize="cover";
    document.body.style.backgroundPosition="center";
    document.body.style.backgroundRepeat="no-repeat";
    document.body.style.backgroundAttachment="fixed";
}

bgInput.onchange = e=>{
    const file = e.target.files[0];
    if(!file) return;

    const reader = new FileReader();
    reader.onload = ()=>{
        const base64 = reader.result;
        localStorage.setItem("bg", base64);
        document.body.style.backgroundImage = `url(${base64})`;
        document.body.style.backgroundSize="cover";
        document.body.style.backgroundPosition="center";
        document.body.style.backgroundRepeat="no-repeat";
        document.body.style.backgroundAttachment="fixed";
    };
    reader.readAsDataURL(file);
};

/* THUMBNAIL */
async function createThumbnail(file){
    return new Promise(resolve=>{
        const video = document.createElement("video");
        video.src = URL.createObjectURL(file);
        video.onloadeddata = ()=>{ video.currentTime = 1; };
        video.onseeked = ()=>{
            const canvas = document.createElement("canvas");
            canvas.width = video.videoWidth || 320;
            canvas.height = video.videoHeight || 180;
            canvas.getContext("2d").drawImage(video,0,0);
            resolve(canvas.toDataURL("image/jpeg",0.4));
        };
    });
}

/* LOAD */
async function loadVideos(){
    const { data } = await sb
        .from("videos")
        .select("*")
        .order("id",{ascending:false})
        .limit(50);
    videos = data || [];
    render();
}

/* RENDER (nút xóa chỉ hiện khi hover) */
function render(){
    grid.innerHTML = "";
    videos.forEach((v,i)=>{
        if(!v.thumb_url) return;
        const div = document.createElement("div");
        div.className = "video-item";

        // Thumbnail
        const img = document.createElement("img");
        img.src = v.thumb_url;
        img.className = "thumb";
        img.loading = "lazy";
        div.appendChild(img);

        // Hover preview video
        let preview;
        div.onmouseenter = ()=>{
            preview = document.createElement("video");
            preview.src = v.video_url;
            preview.muted = true;
            preview.loop = true;
            preview.autoplay = true;
            div.replaceChild(preview, img);

            // Khi hover, show delete button
            delBtn.style.display = "flex";
        };
        div.onmouseleave = ()=>{
            if(preview) preview.pause();
            div.replaceChild(img, preview);

            // Khi rời, ẩn delete button
            delBtn.style.display = "none";
        };

        // Nút xóa (ẩn mặc định)
        const delBtn = document.createElement("div");
        delBtn.innerText = "✕";
        delBtn.className = "delete-btn";
        delBtn.style.display = "none"; // ẩn mặc định
        delBtn.onclick = (e)=>{
            e.stopPropagation();
            deleteVideo(v.id, v.video_url.split("/").pop(), v.thumb_url.split("/").pop());
        };
        div.appendChild(delBtn);

        div.onclick = ()=>openViewer(i);
        grid.appendChild(div);
    });
}

/* XÓA VIDEO CHUẨN */
async function deleteVideo(id, videoName, thumbName){
    try {
        // xóa video trong storage
        await sb.storage.from("videos").remove([videoName]);

        // xóa thumbnail
        await sb.storage.from("thumbs").remove([thumbName]);

        // xóa database
        await sb.from("videos").delete().eq("id", id);

        // reload danh sách
        await loadVideos();
    } catch(err){
        console.error("Delete error:", err);
    }
}

/* RETRY */
async function retryUpload(fn,retries=3){
    for(let i=0;i<retries;i++){
        try{ return await fn(); }
        catch(e){ if(i===retries-1) throw e; }
    }
}

/* QUEUE */
let queue = Promise.resolve();
upload.onchange = e=>{
    for(const file of e.target.files){
        queue = queue.then(()=>handleUpload(file));
    }
};

async function handleUpload(file){
    const name = Date.now()+"_"+Math.random().toString(36).slice(2);

    const progress = document.getElementById("uploadProgress");
    const text = document.getElementById("uploadText");

    progress.style.display = "block";
    progress.value = 0;
    text.innerText = "0%";

    try{
        /* THUMB */
        text.innerText = "creating thumb...";
        const thumb = await createThumbnail(file);
        const thumbBlob = await (await fetch(thumb)).blob();

        await retryUpload(()=>{
            return sb.storage
                .from("thumbs")
                .upload(name+".jpg", thumbBlob, { contentType: "image/jpeg", upsert: true });
        });
        progress.value = 30;
        text.innerText = "30%";

        /* VIDEO */
        text.innerText = "uploading video...";
        await retryUpload(()=>{
            return sb.storage
                .from("videos")
                .upload(name+".mp4", file, { contentType: file.type || "video/mp4", upsert: true });
        });
        progress.value = 80;
        text.innerText = "80%";

        /* URL */
        const videoUrl = sb.storage
            .from("videos")
            .getPublicUrl(name+".mp4").data.publicUrl;

        const thumbUrl = sb.storage
            .from("thumbs")
            .getPublicUrl(name+".jpg").data.publicUrl;

        /* DB */
        await retryUpload(()=>{
            return sb.from("videos").insert([{ video_url: videoUrl, thumb_url: thumbUrl }]);
        });
        progress.value = 100;
        text.innerText = "done";

        loadVideos();

    }catch(err){
        console.error(err);
        text.innerText = "error";
        alert("upload loi: "+err.message);
    }
}

/* VIEWER */
const viewer = document.getElementById("viewer");
const mainVideo = document.getElementById("mainVideo");

function openViewer(i){
    current=i;
    viewer.style.display="flex";
    mainVideo.src=videos[i].video_url;
}

function next(){
    current=(current+1)%videos.length;
    mainVideo.src=videos[current].video_url;
}

function prev(){
    current=(current+videos.length)%videos.length;
    mainVideo.src=videos[current].video_url;
}

function closeViewer(){
    mainVideo.pause();
    viewer.style.display="none";
}

/* SWIPE */
let startX=0;
viewer.addEventListener("touchstart",e=>{ startX=e.touches[0].clientX; });
viewer.addEventListener("touchend",e=>{
    let endX=e.changedTouches[0].clientX;
    if(startX-endX>50) next();
    if(endX-startX>50) prev();
});

/* INIT */
loadVideos();

/* SERVICE WORKER */
if('serviceWorker' in navigator){ navigator.serviceWorker.register("service-worker.js"); }

/* DARKNESS */
const overlay = document.getElementById("bg-overlay");
const slider = document.getElementById("darkness");

let savedDark = localStorage.getItem("darkness");
if(savedDark === null) savedDark = 0.5;

overlay.style.background = `rgba(0,0,0,${savedDark})`;
slider.value = savedDark;
slider.oninput = (e)=>{
    let val = e.target.value;
    overlay.style.background = `rgba(0,0,0,${val})`;
    localStorage.setItem("darkness", val);
};
