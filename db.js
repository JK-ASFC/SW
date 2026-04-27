const BQ_DB = (() => {
  const NAME = 'BurgerQuizDB', VER = 1;
  let _db = null;

  function open() {
    if (_db) return Promise.resolve(_db);
    return new Promise((ok, fail) => {
      const req = indexedDB.open(NAME, VER);
      req.onupgradeneeded = e => {
        const d = e.target.result;
        if (!d.objectStoreNames.contains('slides'))
          d.createObjectStore('slides', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('media'))
          d.createObjectStore('media', { keyPath: 'name' });
      };
      req.onsuccess = e => { _db = e.target.result; ok(_db); };
      req.onerror = e => fail(e.target.error);
    });
  }

  function wrap(idbReq) {
    return new Promise((ok, fail) => {
      idbReq.onsuccess = e => ok(e.target.result);
      idbReq.onerror = e => fail(e.target.error);
    });
  }

  function useStore(storeName, mode, fn) {
    return open().then(d => fn(d.transaction(storeName, mode).objectStore(storeName)));
  }

  const getSlides = () =>
    useStore('slides', 'readonly', s => wrap(s.getAll()))
      .then(arr => arr.sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

  const getSlidesByList = (listId) =>
    useStore('slides', 'readonly', s => wrap(s.getAll()))
      .then(arr => arr.filter(s => s.listId === listId)
                      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));

  const putSlide  = slide => useStore('slides', 'readwrite', s => wrap(s.put(slide)));
  const delSlide  = id    => useStore('slides', 'readwrite', s => wrap(s.delete(id)));
  const clearSlides = ()  => useStore('slides', 'readwrite', s => wrap(s.clear()));

  const putMedia      = (name, blob) => useStore('media', 'readwrite', s => wrap(s.put({ name, blob })));
  const getMedia      = name         => useStore('media', 'readonly',  s => wrap(s.get(name)));
  const delMedia      = name         => useStore('media', 'readwrite', s => wrap(s.delete(name)));
  const getAllMediaKeys = ()          => useStore('media', 'readonly',  s => wrap(s.getAllKeys()));

  const uuid = () =>
    (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);

  async function mediaURL(name) {
    if (!name) return null;
    try {
      const rec = await getMedia(name);
      if (rec?.blob) return URL.createObjectURL(rec.blob);
    } catch (_) {}
    const ext = (name.split('.').pop() || '').toLowerCase();
    if (['mp4','webm','mov'].includes(ext))          return 'videos/' + name;
    if (['mp3','ogg','wav','m4a'].includes(ext))     return 'videos/' + name;
    if (['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return 'img/' + name;
    if (ext === 'pdf')                               return 'videos/' + name;
    return name;
  }

  const exportJSON = async () => JSON.stringify(await getSlides(), null, 2);

  async function importJSON(json) {
    const slides = JSON.parse(json);
    await clearSlides();
    for (const s of slides) await putSlide(s);
  }

  function importCSV(csvText) {
    return csvText.split('\n')
      .map(l => l.trim().replace(/\r$/, ''))
      .filter(Boolean)
      .map((line, i) => {
        const c = line.split(';').map(x => x.trim());
        const base = { id: uuid(), type: c[0], order: i };
        switch (c[0]) {
          case 'V': return { ...base, mediaName: c[1] + '.mp4' };
          case 'N': return { ...base, question: c[1], answerA: c[2], answerB: c[3], answerC: c[4], answerD: c[5] };
          case 'S': return { ...base, question: c[1], answer: c[2] };
          case 'I': return { ...base, title: c[1], question: c[2], mediaName: c[3] + '.png' };
          case 'M': return { ...base, question: c[1], answer: c[2] };
          case 'L': return { ...base, item1: c[1], item2: c[2], item3: c[3] };
          case 'A': return { ...base, title: c[1], answer: c[2] };
          case 'B': return { ...base, question: c[1] };
          default:  return base;
        }
      });
  }

  return {
    getSlides, getSlidesByList, putSlide, delSlide, clearSlides,
    putMedia, getMedia, delMedia, getAllMediaKeys,
    uuid, mediaURL, exportJSON, importJSON, importCSV
  };
})();
