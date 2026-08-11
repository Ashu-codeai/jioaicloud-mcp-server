import { loadConfig } from "../src/config.ts";
import { JioClient } from "../src/api/client.ts";
import {
  createFolderAlbum,
  deleteFolderAlbums,
  listBoardAlbums,
  listFolderAlbums,
  renameFolderAlbum,
} from "../src/api/albums.ts";

async function main() {
  const config = loadConfig();
  const client = new JioClient(config);

  const folders = await listFolderAlbums(client, config, { limit: 5 });
  console.log(
    "folders",
    folders.count,
    folders.albums.slice(0, 3).map((a) => a.name)
  );

  const boards = await listBoardAlbums(client);
  console.log(
    "boards",
    boards.count,
    boards.albums.slice(0, 3).map((a) => a.name)
  );

  const name = `MCP Album Smoke ${Date.now()}`;
  const created = await createFolderAlbum(client, config, { name });
  console.log("created", created.id, created.name);

  const renamed = await renameFolderAlbum(client, config, {
    id: created.id,
    name: name + " Renamed",
  });
  console.log("rename", renamed);

  const del = await deleteFolderAlbums(client, [created.id], {
    dry_run: false,
    confirm: true,
  });
  console.log("trashed", del);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
