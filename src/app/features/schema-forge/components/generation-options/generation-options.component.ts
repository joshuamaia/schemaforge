import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MatCheckbox } from '@angular/material/checkbox';
import { MatOption } from '@angular/material/core';
import { MatFormField, MatHint, MatLabel } from '@angular/material/form-field';
import { MatInput } from '@angular/material/input';
import { MatSelect } from '@angular/material/select';
import { MatSlideToggle } from '@angular/material/slide-toggle';
import { MatTooltip } from '@angular/material/tooltip';
import { JavaFieldNaming, LombokOptions, OptionalHandling } from '../../models/config.model';
import { SchemaForgeStore } from '../../services/schema-forge.store';

interface Choice<T> {
  readonly value: T;
  readonly label: string;
}

type LombokKey = keyof LombokOptions;

/** Output options of the selected format (Java package, Lombok, TypeScript naming…). */
@Component({
  selector: 'sf-generation-options',
  imports: [
    MatFormField,
    MatLabel,
    MatHint,
    MatInput,
    MatSelect,
    MatOption,
    MatSlideToggle,
    MatCheckbox,
    MatTooltip,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './generation-options.component.html',
  styleUrl: './generation-options.component.scss',
})
export class GenerationOptionsComponent {
  protected readonly store = inject(SchemaForgeStore);
  protected readonly java = computed(() => this.store.config().java);
  protected readonly lombok = computed(() => this.store.config().java.lombok);
  protected readonly typescript = computed(() => this.store.config().typescript);

  protected readonly optionalChoices: readonly Choice<OptionalHandling>[] = [
    { value: 'wrapper', label: 'Tipos wrapper (Integer, Boolean…)' },
    { value: 'primitive-required', label: 'Primitivos para obrigatórios' },
    { value: 'optional', label: 'Optional<T> para opcionais' },
  ];

  protected readonly namingChoices: readonly Choice<JavaFieldNaming>[] = [
    { value: 'camelCase', label: 'camelCase' },
    { value: 'snake_case', label: 'snake_case' },
    { value: 'original', label: 'Original do JSON' },
  ];

  protected readonly lombokChoices: readonly { key: LombokKey; label: string }[] = [
    { key: 'data', label: '@Data' },
    { key: 'getter', label: '@Getter' },
    { key: 'setter', label: '@Setter' },
    { key: 'builder', label: '@Builder' },
    { key: 'noArgsConstructor', label: '@NoArgsConstructor' },
    { key: 'allArgsConstructor', label: '@AllArgsConstructor' },
  ];

  /** Explains why an option is implied by another one, or `null` when it is independent. */
  protected lombokNote(key: LombokKey): string | null {
    const lombok = this.lombok();
    if ((key === 'getter' || key === 'setter') && lombok.data) {
      return 'Já incluído em @Data';
    }
    if (key === 'allArgsConstructor' && lombok.builder && lombok.noArgsConstructor) {
      return 'Exigido por @Builder com @NoArgsConstructor';
    }
    return null;
  }

  protected setLombok(key: LombokKey, checked: boolean): void {
    this.store.updateLombok({ [key]: checked });
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
