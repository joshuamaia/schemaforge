export interface FileTreeNode {
  /** Display name; chains of single folders are collapsed (`com/example/model`). */
  readonly name: string;
  /** Full path of the file or folder. */
  readonly path: string;
  readonly kind: 'folder' | 'file';
  readonly children: readonly FileTreeNode[];
}

interface MutableFolder {
  readonly folders: Map<string, MutableFolder>;
  readonly files: string[];
}

/** Builds a sorted folder tree (folders first) from file paths. */
export function buildFileTree(paths: readonly string[]): FileTreeNode[] {
  const root: MutableFolder = { folders: new Map(), files: [] };
  for (const path of paths) {
    const segments = path.split('/');
    let folder = root;
    for (const segment of segments.slice(0, -1)) {
      let next = folder.folders.get(segment);
      if (!next) {
        next = { folders: new Map(), files: [] };
        folder.folders.set(segment, next);
      }
      folder = next;
    }
    folder.files.push(path);
  }

  const toNodes = (folder: MutableFolder, prefix: string): FileTreeNode[] => {
    const folders = [...folder.folders.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, child]): FileTreeNode => {
        let displayName = name;
        let path = prefix ? `${prefix}/${name}` : name;
        let current = child;
        while (current.files.length === 0 && current.folders.size === 1) {
          const [nextName, nextFolder] = [...current.folders.entries()][0];
          displayName = `${displayName}/${nextName}`;
          path = `${path}/${nextName}`;
          current = nextFolder;
        }
        return { name: displayName, path, kind: 'folder', children: toNodes(current, path) };
      });
    const files = [...folder.files]
      .sort((a, b) => a.localeCompare(b))
      .map((path): FileTreeNode => ({
        name: path.slice(path.lastIndexOf('/') + 1),
        path,
        kind: 'file',
        children: [],
      }));
    return [...folders, ...files];
  };

  return toNodes(root, '');
}
