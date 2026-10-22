import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { IconComponent } from '../../../../shared/components/icon/icon.component';
import { FileTreeNode, buildFileTree } from '../../../../shared/utils/file-tree';
import { GeneratedFile } from '../../models/generated-file.model';

interface ExplorerRow {
  readonly node: FileTreeNode;
  readonly depth: number;
  readonly file: GeneratedFile | null;
}

/** File explorer of the generated output (`generated/…`). */
@Component({
  selector: 'sf-file-explorer',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <nav class="explorer" aria-label="Arquivos gerados">
      <div class="root">
        <sf-icon name="folder-open" [size]="14" />
        generated
      </div>
      <ul role="list">
        @for (row of rows(); track row.node.path) {
          <li [style.--depth]="row.depth">
            @if (row.file; as file) {
              <button
                type="button"
                class="item file"
                [class.active]="file.path === activePath()"
                [attr.aria-current]="file.path === activePath() ? 'true' : null"
                [title]="file.path"
                (click)="selectFile.emit(file)"
              >
                <sf-icon
                  [name]="file.language === 'java' ? 'coffee' : 'file-type'"
                  [size]="14"
                  [class]="file.language"
                />
                <span>{{ row.node.name }}</span>
              </button>
            } @else {
              <div class="item folder" [title]="row.node.path">
                <sf-icon name="folder" [size]="14" />
                <span>{{ row.node.name }}</span>
              </div>
            }
          </li>
        }
      </ul>
    </nav>
  `,
  styles: `
    :host {
      display: block;
      overflow: auto;
    }
    .explorer {
      padding: 8px 6px;
      font-size: 12.5px;
    }
    .root {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 8px;
      color: var(--sf-muted);
      font-weight: 600;
    }
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li {
      --depth: 0;
      padding-left: calc(var(--depth) * 12px + 12px);
    }
    .item {
      display: flex;
      align-items: center;
      gap: 6px;
      width: 100%;
      min-height: 26px;
      padding: 3px 8px;
      border: 0;
      border-radius: var(--sf-radius-sm);
      background: transparent;
      color: var(--sf-text);
      font: inherit;
      text-align: left;
      span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
    .folder {
      color: var(--sf-muted);
      font-family: var(--sf-mono);
      font-size: 11.5px;
    }
    .file {
      cursor: pointer;
      &:hover {
        background: var(--sf-surface-3);
      }
      &.active {
        background: var(--sf-accent-soft);
        color: var(--sf-accent);
        font-weight: 600;
      }
    }
    .java {
      color: #f59e0b;
    }
    .typescript {
      color: #3b82f6;
    }
  `,
})
export class FileExplorerComponent {
  readonly files = input.required<readonly GeneratedFile[]>();
  readonly activePath = input<string | null>(null);
  readonly selectFile = output<GeneratedFile>();

  protected readonly rows = computed<ExplorerRow[]>(() => {
    const files = new Map(this.files().map((file) => [file.path, file]));
    const rows: ExplorerRow[] = [];
    const walk = (nodes: readonly FileTreeNode[], depth: number): void => {
      for (const node of nodes) {
        rows.push({ node, depth, file: files.get(node.path) ?? null });
        walk(node.children, depth + 1);
      }
    };
    walk(buildFileTree([...files.keys()]), 0);
    return rows;
  });
}
