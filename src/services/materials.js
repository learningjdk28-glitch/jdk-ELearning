import { supabase } from '../lib/supabase.js';
import { unwrap } from './lms.js';
const bucket = 'learning-materials';
const types = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', txt: 'text/plain', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
export const getMaterials = moduleId => supabase.from('learning_materials').select('*').eq('module_id', moduleId).order('created_at').then(unwrap);
export const updateMaterial = (id, fields) => supabase.from('learning_materials').update(fields).eq('id', id).select().single().then(unwrap);
export async function uploadMaterial(moduleId, file) {
  const ext = file?.name?.split('.').pop().toLowerCase();
  const mime = types[ext];
  if (!mime || (file.type && mime !== file.type)) throw new Error('Upload PDF, DOCX, PPTX, TXT, PNG, or JPG only.');
  if (file.size < 1 || file.size > 25 * 1024 * 1024) throw new Error('File must be 1 byte to 25 MB.');
  const path = `${moduleId}/${crypto.randomUUID()}.${ext}`;
  unwrap(await supabase.storage.from(bucket).upload(path, file, { contentType: mime, upsert: false }));
  try {
    return unwrap(await supabase.from('learning_materials').insert({module_id: moduleId, title: file.name.slice(0, 240), storage_path: path, mime_type: mime, file_size: file.size, published: false}).select().single());
  } catch (e) {
    await supabase.storage.from(bucket).remove([path]);
    throw e;
  }
}
export async function deleteMaterial(material) {
  // Delete object first while its row is still accessible; retain DB row if storage fails.
  unwrap(await supabase.storage.from(bucket).remove([material.storage_path]));
  unwrap(await supabase.from('learning_materials').delete().eq('id', material.id));
}
export async function openMaterial(material) {
  // Acquire a browsing context before awaiting a URL to avoid popup blocking.
  const popup = window.open('', '_blank');
  try {
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(material.storage_path, 90);
    if (error) throw new Error(error.message);
    if (popup) { popup.opener = null; popup.location.replace(data.signedUrl); }
    else window.location.assign(data.signedUrl);
  } catch (e) {
    popup?.close();
    throw e;
  }
}
