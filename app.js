// app.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://xlcafduamrdxalryttuk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhsY2FmZHVhbXJkeGFscnl0dHVrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY1NjQ3MTQsImV4cCI6MjA3MjE0MDcxNH0.BJb77sTb__k1-hrJEGal8KJ1TGLDBUOAm51Q0uU6T-I';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);






/* ---------- Helpers ---------- */
function qsel(s){ return document.querySelector(s); }
function qall(s){ return Array.from(document.querySelectorAll(s)); }

function escapeHtml(s){
  // minimal sanitizer for text only (we still store iframe_html raw to keep embeds)
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

async function fetchVideos(includeDeleted=false){
  let filter = supabase.from('videos').select('*').order('created_at',{ascending:false});
  const { data, error } = await filter;
  if (error) { console.error(error); return []; }
  return (data || []).filter(v => includeDeleted || !v.is_deleted);
}

function shuffle(arr){
  let a = [...arr];
  for(let i=a.length-1;i>0;i--){
    const j = Math.floor(Math.random()*(i+1));
    [a[i],a[j]]=[a[j],a[i]];
  }
  return a;
}

/* ---------- Rendering video card ---------- */
function renderVideoCard(video){
  const div = document.createElement('div');
  div.className = 'video-card';

  const thumb = document.createElement('div');
  thumb.className = 'thumb';
  // show provided thumbnail or try YT thumbnail extraction
  const thumbUrl = video.thumbnail_url || extractYoutubeThumb(video.iframe_html);
  if (thumbUrl){
    const img = document.createElement('img');
    img.src = thumbUrl;
    img.alt = video.title;
    img.loading = 'lazy';
    thumb.appendChild(img);
  } else {
    thumb.innerHTML = '<div class="small">No preview</div>';
  }

  // three-dots menu container
  const more = document.createElement('div');
  more.style.position='absolute'; more.style.right='20px'; more.style.top='5px';
  const btn = document.createElement('button'); 
  btn.className = 'moreBtn'; 
  btn.textContent = '⋮'; 
  btn.style.fontSize = '2.5rem'; // Increase the size of the button
  more.appendChild(btn);
  thumb.appendChild(more);

  div.appendChild(thumb);

  const vm = document.createElement('div'); vm.className='vmeta';
  vm.innerHTML = `<h4>${escapeHtml(video.title)}</h4>
    <div class="small">${video.view_count || 0} views</div>
    <div class="tags"></div>`;

  if (Array.isArray(video.tags)){
    const tagsEl = vm.querySelector('.tags');
    video.tags.slice(0,3).forEach(t=>{
      const s = document.createElement('span'); s.className='tag'; s.textContent = '#'+t;
      tagsEl.appendChild(s);
    });
  }

  // click to play
// click to redirect to watch page
thumb.addEventListener('click', () => {
  location.href = `watch.html?id=${video.id}`;
});


  // menu popup
  let popup;
  btn.addEventListener('click', (e)=>{
    e.stopPropagation();
    if (popup) { popup.remove(); popup = null; return; }
    popup = document.createElement('div');
    popup.className='menu-popup';
    popup.innerHTML = `
      <button class="editBtn">Edit Upload</button>
      <button class="addToPlaylistBtn">Add to Playlist</button>
      <button class="deleteBtn" style="color:#ff6b6b">Delete</button>
    `;
    more.appendChild(popup);

    popup.querySelector('.deleteBtn').addEventListener('click', async()=>{
      await deleteVideo(video.id);
      popup.remove(); popup=null;
      await reloadPageContent();
    });

    popup.querySelector('.editBtn').addEventListener('click', ()=>{
      showEditModal(video);
      popup.remove(); popup=null;
    });

    popup.querySelector('.addToPlaylistBtn').addEventListener('click', ()=>{
      showAddToPlaylistModal(video);
      popup.remove(); popup=null;
    });
  });

  div.appendChild(vm);
  return div;
}

/* ---------- extract YT id & thumb ---------- */
function extractYoutubeThumb(iframe_html){
  try {
    const m = iframe_html.match(/(?:youtube\.com\/embed\/|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (m) return `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`;
  } catch(e){}
  return null;
}

/* ---------- Player logic ---------- */
let currentVideo = null;
function setPlayerVideo(video){
  currentVideo = video;
  const wrapper = qsel('#playerWrapper') || qsel('#watchPlayer');
  if (!wrapper) return;
  wrapper.innerHTML = ''; // clear

  // increment view counter on watch (fire-and-forget)
  supabase.from('videos').update({ view_count: (video.view_count||0)+1 }).eq('id', video.id).then(()=>{});
  // inject iframe_html - this is raw HTML
  const container = document.createElement('div');
  container.innerHTML = video.iframe_html;
  // make responsive
  const iframe = container.querySelector('iframe');
  if (iframe){
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.setAttribute('allowfullscreen','');
  } else {
    // if no iframe then show as text
    container.innerHTML = '<div class="small">Invalid embed</div>';
  }
  wrapper.appendChild(container);

  const titleEl = qsel('#playerTitle') || qsel('#playlistTitle');
  if (titleEl) titleEl.textContent = video.title;
  // update recommendations to exclude current
  renderRecommendations(video);
}

/* fullscreen on mobile */
function doFullscreen(){
  const el = qsel('#playerWrapper') || qsel('#watchPlayer');
  if (!el) return;
  if (el.requestFullscreen) el.requestFullscreen();
  else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
}

/* ---------- CRUD actions ---------- */
async function createVideo({ title, iframe_html, tags=[], thumbnail_url='' }){
  const { data, error } = await supabase.from('videos').insert([{
    title, iframe_html, tags, thumbnail_url
  }]);
  if (error) throw error;
  return data;
}

async function updateVideo(id, changes){
  const { data, error } = await supabase.from('videos').update(changes).eq('id',id);
  if (error) throw error;
  return data;
}

async function deleteVideo(id){
  // soft-delete
  const { error } = await supabase.from('videos').update({ is_deleted:true }).eq('id', id);
  if (error) console.error(error);
}

async function restoreVideo(id){
  const { error } = await supabase.from('videos').update({ is_deleted:false }).eq('id', id);
  if (error) console.error(error);
}

/* ---------- Playlists ---------- */
async function listPlaylists(){
  const { data, error } = await supabase.from('playlists').select('*').order('created_at',{ascending:false});
  if (error) { console.error(error); return []; }
  return data || [];
}

async function createPlaylist(name){
  const { data, error } = await supabase.from('playlists').insert([{ name }]);
  if (error) throw error;
  return data;
}

async function addVideoToPlaylist(playlistId, videoId){
  const { data:pl } = await supabase.from('playlists').select('video_ids').eq('id', playlistId).single();
  const arr = pl.video_ids || [];
  if (!arr.find(id => id===videoId)){
    arr.push(videoId);
    await supabase.from('playlists').update({ video_ids: arr }).eq('id', playlistId);
  }
}

async function removeVideoFromPlaylist(playlistId, videoId){
  const { data:pl } = await supabase.from('playlists').select('video_ids').eq('id', playlistId).single();
  const arr = (pl.video_ids || []).filter(id => id!==videoId);
  await supabase.from('playlists').update({ video_ids: arr }).eq('id', playlistId);
}

/* ---------- UI modals ---------- */
function showEditModal(video){
  // simple prompt-based edit (for brevity)
  const newTitle = prompt('Edit title', video.title);
  if (newTitle === null) return;
  const newIframe = prompt('Edit iframe HTML (paste full <iframe>..)</iframe>)', video.iframe_html);
  if (newIframe === null) return;
  const newTagsStr = prompt('Tags (comma separated)', (video.tags||[]).join(', '));
  const tags = newTagsStr ? newTagsStr.split(',').map(t=>t.trim()).filter(Boolean) : [];
  updateVideo(video.id, { title: newTitle, iframe_html: newIframe, tags });
  setTimeout(()=> reloadPageContent(), 700);
}

async function showAddToPlaylistModal(video){
  // open small modal showing playlists then add
  const playlists = await listPlaylists();
  const choice = prompt(`Playlists:\n${playlists.map((p,i)=> `${i+1}. ${p.name}`).join('\n')}\n\nEnter number to add or Cancel`);
  if (!choice) return;
  const idx = parseInt(choice)-1;
  if (idx>=0 && playlists[idx]) {
    await addVideoToPlaylist(playlists[idx].id, video.id);
    alert('Added to ' + playlists[idx].name);
  }
}

/* ---------- Render lists ---------- */
async function renderHome(){
  const videos = await fetchVideos(false);
  const grid = qsel('#videoGrid');
  const recGrid = qsel('#recommendGrid');
  if (!grid) return;

  // clear
  grid.innerHTML = '';

  // shuffle for random on each refresh
  const shuffled = shuffle(videos);
  shuffled.forEach(v=>{
    grid.appendChild(renderVideoCard(v));
  });

  // default select first for player
  if (shuffled.length>0){
    setPlayerVideo(shuffled[0]);
  }

  // recommendations: first 4 others
  const recs = shuffled.slice(1,6);
  if (recGrid){
    recGrid.innerHTML = '';
    recs.forEach(v=>recGrid.appendChild(renderVideoCard(v)));
  }
}

async function renderWatchPage(videoId){
  const videos = await fetchVideos(false);
  const selected = videos.find(v=>v.id===videoId) || videos[0];
  if (!selected) return;
  setPlayerVideo(selected);
  // show others as recs
  const grid = qsel('#watchGrid');
  if (grid){
    grid.innerHTML='';
    videos.filter(v=>v.id!==selected.id).slice(0,6).forEach(v=>grid.appendChild(renderVideoCard(v)));
  }
}

async function renderPlaylistsPage(){
  const container = qsel('#playlistList');
  if (!container) return;
  container.innerHTML = '';
  const pls = await listPlaylists();
  pls.forEach(p=>{
    const el = document.createElement('div'); el.className='card';
    el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
      <strong>${escapeHtml(p.name)}</strong>
      <div>
        <button class="btn view" data-id="${p.id}">View</button>
        <button class="btn delete" data-id="${p.id}">Delete</button>
      </div>
    </div><div class="small">${(p.video_ids||[]).length} videos</div>`;
    container.appendChild(el);
  });
  //attach handlers
  container.querySelectorAll('.view').forEach(b=>{
    b.addEventListener('click', async e=>{
      const id = e.currentTarget.dataset.id;
      const pl = (await listPlaylists()).find(x=>x.id===id);
      if (!pl) return;
      // show viewer
      qsel('#playlistTitle').textContent = pl.name;
      qsel('#playlistViewer').classList.remove('hidden');
      qsel('#playlistList').classList.add('hidden');
      // fetch videos
      const vids = [];
      for(const vid of (pl.video_ids||[])){
        const r = await supabase.from('videos').select('*').eq('id', vid).maybeSingle();
        const vdata = r.data;
        if (vdata && !vdata.is_deleted) vids.push(vdata);
      }
      const containerV = qsel('#playlistVideos');
      containerV.innerHTML = '';
      vids.forEach(v=>containerV.appendChild(renderVideoCard(v)));
    });
  });





  container.querySelectorAll('.delete').forEach(b=>{
    b.addEventListener('click', async e=>{
      const id = e.currentTarget.dataset.id;
      if (confirm('Delete playlist?')) {
        await supabase.from('playlists').delete().eq('id', id);
        renderPlaylistsPage();
      }
    });
  });
}

async function renderDeletedPage(){
  const grid = qsel('#deletedGrid');
  if (!grid) return;
  const all = await fetchVideos(true);
  const deleted = all.filter(v=>v.is_deleted);
  grid.innerHTML = '';
  deleted.forEach(v=>{
    const el = renderVideoCard(v);
    // override menu to have Restore button
  const restoreBtn = document.createElement('button');
restoreBtn.textContent = 'Restore';
restoreBtn.className = 'btn restore';

    restoreBtn.addEventListener('click', async ()=> {
      await restoreVideo(v.id);
      renderDeletedPage();
    });
    el.querySelector('.vmeta').appendChild(restoreBtn);

    const permDel = document.createElement('button');
    permDel.textContent='Delete Forever';
    permDel.className='btn danger';
    permDel.addEventListener('click', async ()=> {
      if (confirm('Delete forever? This cannot be undone.')) {
        await supabase.from('videos').delete().eq('id', v.id);
        renderDeletedPage();
      }
    });
    el.querySelector('.vmeta').appendChild(permDel);

    grid.appendChild(el);
  });
}

/* ---------- search ---------- */
async function doSearch(q){
  if (!q) return renderHome();
  const all = await fetchVideos(false);
  const s = q.toLowerCase();
  const results = all.filter(v => (v.title && v.title.toLowerCase().includes(s)) ||
    (v.tags && v.tags.some(t=>t.toLowerCase().includes(s))));
  // show results as grid + set first as player
  const grid = qsel('#videoGrid');
  if (!grid) return;
  grid.innerHTML='';
  results.forEach(v=>grid.appendChild(renderVideoCard(v)));
  if (results[0]) setPlayerVideo(results[0]);
}

/* ---------- small UI wiring ---------- */
async function reloadPageContent(){
  const page = location.pathname.split('/').pop();
  if (page === '' || page === 'index.html'){
    await renderHome();
  } else if (page === 'watch.html'){
    const params = new URLSearchParams(location.search);
    await renderWatchPage(params.get('id'));
  } else if (page === 'playlists.html'){
    await renderPlaylistsPage();
  } else if (page === 'deleted.html'){
    await renderDeletedPage();
  } else if (page === 'upload.html'){
    // nothing to load
  }
}

/* ---------- simple modals and events ---------- */
function initUI(){
  // menu modal
  const menuBtn = qsel('#menuBtn');
  const menuModal = qsel('#menuModal');
  if (menuBtn && menuModal){
    menuBtn.addEventListener('click', ()=> menuModal.classList.remove('hidden'));
    qsel('#closeMenu').addEventListener('click', ()=> menuModal.classList.add('hidden'));
  }
  // fullscreen
  const fsBtn = qsel('#fsBtn');
  if (fsBtn) fsBtn.addEventListener('click', doFullscreen);

  // search
  const searchBtn = qsel('#searchBtn');
  const searchInput = qsel('#searchInput');
  if (searchBtn && searchInput){
    searchBtn.addEventListener('click', ()=> doSearch(searchInput.value));
    searchInput.addEventListener('keypress', (e)=>{ if (e.key==='Enter') doSearch(searchInput.value); });
  }
  if (qsel('#searchInput2')) {
    qsel('#searchInput2').addEventListener('keypress', (e)=>{ if (e.key==='Enter') doSearch(e.target.value); });
  }

  // upload page events
  const uploadForm = qsel('#uploadForm');
  if (uploadForm){
    const iframeEl = qsel('#iframe_html');
    const preview = qsel('#preview');
    const previewArea = qsel('#previewArea');
    iframeEl.addEventListener('input', ()=>{
      const val = iframeEl.value.trim();
      if (val){
        previewArea.innerHTML = val;
        preview.classList.remove('hidden');
      } else {
        preview.classList.add('hidden');
      }
    });

    // --- upload form submit (supports create + update) ---
uploadForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = qsel('#title').value.trim();
  const tags = qsel('#tags').value.split(',').map(t => t.trim()).filter(Boolean);
  const iframe_html = qsel('#iframe_html').value.trim();
  const thumbnail = qsel('#thumbnail').value.trim();
  const editingIdEl = qsel('#editingId');

  try {
    if (editingIdEl && editingIdEl.value) {
      // update existing video
      await updateVideo(editingIdEl.value, {
        title, iframe_html, tags, thumbnail_url: thumbnail
      });
      editingIdEl.value = '';
      qsel('#uploadBtn').textContent = 'Upload';
      alert('Video updated!');
    } else {
      // create new
      await createVideo({ title, iframe_html, tags, thumbnail_url: thumbnail });
      alert('Uploaded!');
    }

    // reset UI
    uploadForm.reset();
    if (qsel('#previewArea')) qsel('#previewArea').innerHTML = '';
    // reload the list if present
    if (typeof loadUploadedVideos === 'function') loadUploadedVideos();

  } catch (err) {
    console.error(err);
    alert('Save failed: ' + (err.message || err));
  }
});

// --- Manage uploaded videos list (renders on upload.html) ---
const videosContainer = qsel('#uploadedVideos');
if (videosContainer) {
  // declare as function in this scope so submit handler can call it
  async function loadUploadedVideos() {
    const videos = await fetchVideos(true); // include soft-deleted (so you can manage)
    videosContainer.innerHTML = '';

    // render each video as a Tailwind-styled card
    videos.forEach(v => {
      const item = document.createElement('div');
      item.className = 'bg-darkcard rounded-lg p-4 flex flex-col justify-between';
      item.innerHTML = `
        <div class="flex justify-between items-start gap-4">
          <div>
            <h3 class="text-lg font-semibold text-gray-100 mb-1">${escapeHtml(v.title)}</h3>
            <div class="text-sm text-gray-400 mb-2">${(v.tags || []).join(', ')}</div>
            <div class="text-xs text-gray-500">${v.is_deleted ? 'Deleted' : ''}</div>
          </div>
          <div class="flex flex-col gap-2">
            <button data-id="${v.id}" class="edit px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm">Edit</button>
            <button data-id="${v.id}" class="delete px-3 py-2 bg-red-600 hover:bg-red-700 text-white rounded text-sm">Delete</button>
          </div>
        </div>
      `;
      videosContainer.appendChild(item);
    });

    // attach edit handlers
    videosContainer.querySelectorAll('.edit').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        const video = (await fetchVideos(true)).find(x => x.id == id);
        if (!video) return alert('Video not found');

        // pre-fill form for editing
        qsel('#title').value = video.title || '';
        qsel('#tags').value = (video.tags || []).join(', ');
        qsel('#iframe_html').value = video.iframe_html || '';
        qsel('#thumbnail').value = video.thumbnail_url || '';
        if (qsel('#previewArea')) {
          qsel('#previewArea').innerHTML = video.iframe_html || '';
          qsel('#preview')?.classList.remove('hidden');
        }
        qsel('#editingId').value = id;
        qsel('#uploadBtn').textContent = 'Save';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });

    // attach delete handlers (soft delete)
    videosContainer.querySelectorAll('.delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        if (!confirm('Delete this video?')) return;
        await deleteVideo(id); // uses existing soft-delete
        await loadUploadedVideos();
      });
    });
  }

  // expose loadUploadedVideos to outer scope so form submit can call it
  window.loadUploadedVideos = loadUploadedVideos;

  // initial load
  loadUploadedVideos();
}

  }

  // playlists create
  const createBtn = qsel('#createPlaylistBtn');
  if (createBtn){
    createBtn.addEventListener('click', async ()=>{
      const name = qsel('#newPlaylistName').value.trim();
      if (!name) return alert('Enter name');
      await createPlaylist(name);
      qsel('#newPlaylistName').value='';
      renderPlaylistsPage();
    });
  }

  // back from viewer
  const back = qsel('#backToList');
  if (back) back.addEventListener('click', ()=>{
    qsel('#playlistViewer').classList.add('hidden');
    qsel('#playlistList').classList.remove('hidden');
  });

  // restore page logic is in renderDeletedPage()
}

/* ---------- init ---------- */
window.addEventListener('load', async ()=>{
  initUI();
  await reloadPageContent();
  // attach global FS button if present
  window.doFullscreen = doFullscreen;
});

/* ======================================================
   Auto Playlist by Tags (new + existing videos)
   ====================================================== */

// Helper: add video to playlist (create playlist if missing)
async function ensurePlaylistForTag(tag, videoId) {
  // Check if playlist exists
  const { data: existing, error } = await supabase
    .from('playlists')
    .select('*')
    .eq('name', tag)
    .maybeSingle();

  let playlistId;
  if (existing) {
    playlistId = existing.id;
  } else {
    // Create playlist with this tag name
    const { data: created, error: createErr } = await supabase
      .from('playlists')
      .insert([{ name: tag, video_ids: [] }])
      .select()
      .single();
    if (createErr) {
      console.error("❌ Playlist create failed:", createErr);
      return;
    }
    playlistId = created.id;
  }

  // Add video to playlist (avoid duplicates)
  const { data: playlist, error: selErr } = await supabase
    .from('playlists')
    .select('video_ids')
    .eq('id', playlistId)
    .single();

  if (selErr) {
    console.error("❌ Playlist fetch failed:", selErr);
    return;
  }

  let videoIds = playlist.video_ids || [];
  if (!videoIds.includes(videoId)) {
    videoIds.push(videoId);
    const { error: updErr } = await supabase
      .from('playlists')
      .update({ video_ids: videoIds })
      .eq('id', playlistId);
    if (updErr) console.error("❌ Failed to add video to playlist:", updErr);
  }
}

// Patch createVideo so new uploads update playlists
const _origCreateVideo = createVideo;
createVideo = async function({ title, iframe_html, tags = [], thumbnail_url = '' }) {
  const created = await _origCreateVideo({ title, iframe_html, tags, thumbnail_url });
  if (created && created[0]) {
    const videoId = created[0].id;
    if (Array.isArray(tags)) {
      for (const t of tags) {
        await ensurePlaylistForTag(t, videoId);
      }
    }
  }
  return created;
};

// Backfill existing videos on load
async function backfillTagPlaylists() {
  try {
    const { data: videos, error } = await supabase.from('videos').select('*');
    if (error) {
      console.error("❌ Error fetching videos for backfill:", error);
      return;
    }
    for (const vid of videos) {
      if (Array.isArray(vid.tags)) {
        for (const t of vid.tags) {
          await ensurePlaylistForTag(t, vid.id);
        }
      }
    }
    console.log("✅ Backfill complete: tag-based playlists updated.");
  } catch (err) {
    console.error("❌ Backfill failed:", err);
  }
}

// Run backfill once on app load
backfillTagPlaylists();




