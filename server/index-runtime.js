import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sourcePath = path.join(__dirname, 'index.js');
const runtimePath = path.join(__dirname, '.index-runtime.generated.js');

let source = await fs.readFile(sourcePath, 'utf8');

const originalDmDuplicateBlock = `  await updateJson('messages.json', [], (messages) => {
    const recentDuplicate = messages.some((existing) =>
      (existing.conversationId ? existing.conversationId === conversationId : existing.matchId === match.id) &&
      existing.senderUserId === viewerId &&
      existing.body === body &&
      Date.now() - new Date(existing.createdAt).getTime() < 2500
    );
    if (recentDuplicate) return { value: undefined, result: message };
    return { value: [...messages, message], result: message };
  });
  res.status(201).json({ message: { ...message, sender: 'user' } });`;

const patchedDmDuplicateBlock = `  const savedMessage = await updateJson('messages.json', [], (messages) => {
    const recentDuplicate = messages.some((existing) =>
      (existing.conversationId ? existing.conversationId === conversationId : existing.matchId === match.id) &&
      existing.senderUserId === viewerId &&
      existing.body === body &&
      Date.now() - new Date(existing.createdAt).getTime() < 2500
    );
    if (recentDuplicate) return { value: undefined, result: null };
    return { value: [...messages, message], result: message };
  });
  if (!savedMessage) {
    return res.status(409).json({ message: '同じメッセージを連続送信しています。少し待ってから送信してください。' });
  }
  res.status(201).json({ message: { ...savedMessage, sender: 'user' } });`;

if (!source.includes(originalDmDuplicateBlock)) {
  throw new Error('index-runtime patch failed: DM duplicate block not found. Update server/index-runtime.js to match server/index.js.');
}
source = source.replace(originalDmDuplicateBlock, patchedDmDuplicateBlock);

await fs.writeFile(runtimePath, source, 'utf8');
await import(pathToFileURL(runtimePath).href);
