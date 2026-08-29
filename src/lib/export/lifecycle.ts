export class ExportCoordinator {
  private active = false;

  start(): boolean {
    if (this.active) return false;
    this.active = true;
    return true;
  }

  finish(): void { this.active = false; }
  get isActive(): boolean { return this.active; }
}
