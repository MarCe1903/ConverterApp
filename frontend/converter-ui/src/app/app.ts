import { ChangeDetectorRef, Component, OnDestroy, inject } from '@angular/core';
import { Subscription, firstValueFrom, interval, switchMap, takeWhile } from 'rxjs';

import { ConversionJob } from './models/conversion-job';
import { ConversionJobStartResponse } from './models/conversion-job-start-response';
import { ConverterApiService } from './services/converter-api.service';

type AppTheme = 'light' | 'dark';
type AppLanguage = 'en' | 'tr';

type ConversionTrack = {
  readonly family: string;
  readonly sources: readonly string[];
  readonly target: string;
  readonly note: string;
};

type HeroNote = {
  readonly label: string;
  readonly text: string;
};

type WorkflowStep = {
  readonly id: string;
  readonly number: string;
  readonly title: string;
  readonly description: string;
};

type DirectoryPickerMode = 'read' | 'readwrite';

type WritableFileSink = {
  write(data: Blob): Promise<void>;
  close(): Promise<void>;
  abort?(reason?: unknown): Promise<void>;
};

type BrowserFileHandle = {
  createWritable(): Promise<WritableFileSink>;
};

type BrowserDirectoryHandle = {
  readonly name: string;
  getFileHandle(
    name: string,
    options?: { create?: boolean }
  ): Promise<BrowserFileHandle>;
};

type WindowWithDirectoryPicker = Window & {
  showDirectoryPicker?: (
    options?: { mode?: DirectoryPickerMode }
  ) => Promise<BrowserDirectoryHandle>;
};

type DesktopDirectorySelection = {
  readonly path: string;
  readonly name: string;
};

type DesktopSaveResult = {
  readonly filePath: string;
  readonly fileName: string;
  readonly directoryName: string;
};

type ConverterDesktopApi = {
  pickOutputDirectory(): Promise<DesktopDirectorySelection | null>;
  saveFileToDirectory(
    directoryPath: string,
    fileName: string,
    bytes: Uint8Array
  ): Promise<DesktopSaveResult>;
};

type WindowWithDesktopApi = WindowWithDirectoryPicker & {
  converterDesktop?: ConverterDesktopApi;
};

const LANGUAGE_OPTION_LABELS: Record<AppLanguage, string> = {
  en: 'English',
  tr: 'Türkçe'
};

const APP_COPY = {
  en: {
    brandName: 'ConverterApp',
    languageSwitcherLabel: 'Choose interface language',
    themeSwitchToDark: 'Switch to dark mode',
    themeSwitchToLight: 'Switch to light mode',
    noFileSelected: 'No file selected yet',
    hero: {
      title: 'Convert office files into polished PDFs',
      text:
        'A focused document conversion workspace for local teams, fast handoffs, and reliable PDF output from Word, spreadsheet, and presentation files.',
      badges: ['Word documents', 'Spreadsheet files', 'Presentation decks', 'PDF export'],
      notes: [
        {
          label: 'Local workflow',
          text: 'Built around your local API and ready for a future desktop wrapper.'
        },
        {
          label: 'Background queue',
          text: 'Uploads are queued, processed, and reported back with clear status updates.'
        },
        {
          label: 'Flexible delivery',
          text: 'Download instantly or place the finished PDF into a folder you choose.'
        }
      ] as readonly HeroNote[]
    },
    studio: {
      kicker: 'Conversion Studio',
      title: 'Start a new export',
      pipeline: 'PDF pipeline',
      sourceFile: 'Source file',
      supportedList: 'Supported: DOC, DOCX, ODT, XLS, XLSX, ODS, PPT, PPTX, ODP',
      chooseFile: 'Choose file',
      outputFormat: 'Output format',
      delivery: 'Delivery',
      deliveryText:
        'The finished PDF can be downloaded immediately or saved into a folder you pick after conversion completes.'
    },
    buttons: {
      convert: 'Convert to PDF',
      queueing: 'Queueing...',
      converting: 'Converting...',
      working: 'Working...',
      download: 'Download PDF',
      preparingDownload: 'Preparing download...',
      choosingFolder: 'Choosing folder...',
      saveToFolder: 'Save to selected folder',
      saving: 'Saving...'
    },
    status: {
      inProgress: 'In progress',
      issueDetected: 'Issue detected',
      conversionFailed: 'Conversion failed',
      ready: 'Ready',
      outputFile: 'Output file',
      savedLocation: 'Saved location',
      downloadsFootnote:
        "Downloads follow your browser's default download behavior and location settings.",
      preparingConversion: 'Preparing your conversion'
    },
    supportedFormats: {
      kicker: 'Supported Formats',
      title: 'Built for the files teams share every day'
    },
    workflow: {
      kicker: 'Workflow',
      title: 'A sharper conversion flow'
    },
    tracks: [
      {
        family: 'Word documents',
        sources: ['doc', 'docx', 'odt'],
        target: 'pdf',
        note: 'Reliable PDF exports for contracts, drafts, and editorial files.'
      },
      {
        family: 'Spreadsheet files',
        sources: ['xls', 'xlsx', 'ods'],
        target: 'pdf',
        note: 'Clean handoff for reports, estimates, and structured tables.'
      },
      {
        family: 'Presentation decks',
        sources: ['ppt', 'pptx', 'odp'],
        target: 'pdf',
        note: 'Turn slide decks into fixed-layout files ready to share.'
      }
    ] as readonly ConversionTrack[],
    workflowSteps: [
      {
        id: 'choose',
        number: '01',
        title: 'Choose a source file',
        description: 'Pick a supported office document from your machine.'
      },
      {
        id: 'convert',
        number: '02',
        title: 'Run the conversion',
        description: 'ConverterApp queues the job and processes it in the background.'
      },
      {
        id: 'deliver',
        number: '03',
        title: 'Deliver the result',
        description: 'Download the PDF immediately or save it into a chosen folder.'
      }
    ] as readonly WorkflowStep[],
    messages: {
      chooseSourceFile: 'Choose a source file before starting the conversion.',
      pdfReady: 'Your PDF is ready. Download it now or place it into a folder you choose.',
      folderSaveUnsupported:
        'This browser does not support saving directly into a chosen folder. Use the download option instead.',
      folderPickerActive: 'A folder picker is already open. Close it and try again.',
      savingToFolder: 'Saving "{fileName}" to "{directoryName}"...',
      savedToFolder: '"{fileName}" was saved to "{directoryName}".',
      downloadOrRetry:
        'The PDF is still ready to download. You can download it or try saving to a folder again.',
      queued: 'Queued for conversion.',
      processing: 'Converting document...',
      completed: 'Conversion completed.',
      failed: 'Conversion failed.',
      unexpectedError: 'An unexpected error occurred during conversion.'
    }
  },
  tr: {
    brandName: 'ConverterApp',
    languageSwitcherLabel: 'Arayüz dilini seçin',
    themeSwitchToDark: 'Koyu temaya geç',
    themeSwitchToLight: 'Açık temaya geç',
    noFileSelected: 'Henüz dosya seçilmedi',
    hero: {
      title: 'Ofis dosyalarını düzenli PDF çıktılara dönüştürün',
      text:
        'Yerel ekipler, hızlı dosya teslimleri ve Word, hesap tablosu ve sunum dosyalarından güvenilir PDF çıktıları için tasarlanmış odaklı bir belge dönüştürme alanı.',
      badges: ['Word belgeleri', 'Hesap tabloları', 'Sunum dosyaları', 'PDF çıktısı'],
      notes: [
        {
          label: 'Yerel akış',
          text: 'Tamamen yerel API etrafında çalışır ve ileride masaüstü pakete hazırdır.'
        },
        {
          label: 'Arka plan kuyruğu',
          text: 'Yüklemeler sıraya alınır, işlenir ve net durum güncellemeleriyle geri bildirilir.'
        },
        {
          label: 'Esnek teslim',
          text: 'PDF dosyasını hemen indirin veya tamamlandığında seçtiğiniz klasöre kaydedin.'
        }
      ] as readonly HeroNote[]
    },
    studio: {
      kicker: 'Dönüştürme Alanı',
      title: 'Yeni bir çıktı başlatın',
      pipeline: 'PDF hattı',
      sourceFile: 'Kaynak dosya',
      supportedList: 'Desteklenenler: DOC, DOCX, ODT, XLS, XLSX, ODS, PPT, PPTX, ODP',
      chooseFile: 'Dosya seç',
      outputFormat: 'Çıktı formatı',
      delivery: 'Teslim',
      deliveryText:
        'Tamamlanan PDF, hemen indirilebilir veya dönüştürme bittiğinde seçtiğiniz klasöre kaydedilebilir.'
    },
    buttons: {
      convert: "PDF'e çevir",
      queueing: 'Kuyruğa alınıyor...',
      converting: 'Dönüştürülüyor...',
      working: 'Çalışıyor...',
      download: "PDF'i indir",
      preparingDownload: 'İndirme hazırlanıyor...',
      choosingFolder: 'Klasör seçiliyor...',
      saveToFolder: 'Seçilen klasöre kaydet',
      saving: 'Kaydediliyor...'
    },
    status: {
      inProgress: 'İşleniyor',
      issueDetected: 'Sorun algılandı',
      conversionFailed: 'Dönüştürme başarısız oldu',
      ready: 'Hazır',
      outputFile: 'Çıktı dosyası',
      savedLocation: 'Kayıt konumu',
      downloadsFootnote:
        'İndirmeler tarayıcınızın varsayılan indirme davranışı ve konum ayarlarını kullanır.',
      preparingConversion: 'Dönüştürmeniz hazırlanıyor'
    },
    supportedFormats: {
      kicker: 'Desteklenen Formatlar',
      title: 'Ekiplerin her gün paylaştığı dosyalar için tasarlandı'
    },
    workflow: {
      kicker: 'İş Akışı',
      title: 'Daha keskin bir dönüştürme akışı'
    },
    tracks: [
      {
        family: 'Word belgeleri',
        sources: ['doc', 'docx', 'odt'],
        target: 'pdf',
        note: 'Sözleşmeler, taslaklar ve editöryel dosyalar için güvenilir PDF çıktıları.'
      },
      {
        family: 'Hesap tabloları',
        sources: ['xls', 'xlsx', 'ods'],
        target: 'pdf',
        note: 'Raporlar, teklifler ve yapılandırılmış tablolar için temiz teslim.'
      },
      {
        family: 'Sunum dosyaları',
        sources: ['ppt', 'pptx', 'odp'],
        target: 'pdf',
        note: 'Slayt dosyalarını paylaşmaya hazır sabit yerleşimli PDF dosyalarına dönüştürün.'
      }
    ] as readonly ConversionTrack[],
    workflowSteps: [
      {
        id: 'choose',
        number: '01',
        title: 'Kaynak dosya seç',
        description: 'Bilgisayarınızdan desteklenen bir ofis belgesi seçin.'
      },
      {
        id: 'convert',
        number: '02',
        title: 'Dönüştürmeyi çalıştır',
        description: 'ConverterApp işi kuyruğa alır ve arka planda işler.'
      },
      {
        id: 'deliver',
        number: '03',
        title: 'Sonucu teslim al',
        description: 'PDF dosyasını hemen indirin veya seçtiğiniz klasöre kaydedin.'
      }
    ] as readonly WorkflowStep[],
    messages: {
      chooseSourceFile: 'Dönüştürmeyi başlatmadan önce bir kaynak dosya seçin.',
      pdfReady: 'PDF dosyanız hazır. Hemen indirebilir veya seçtiğiniz bir klasöre yerleştirebilirsiniz.',
      folderSaveUnsupported:
        'Bu tarayıcı doğrudan seçilen klasöre kaydetmeyi desteklemiyor. Bunun yerine indirme seçeneğini kullanın.',
      folderPickerActive: 'Zaten açık bir klasör seçici var. Onu kapatıp tekrar deneyin.',
      savingToFolder: '"{fileName}" dosyası "{directoryName}" klasörüne kaydediliyor...',
      savedToFolder: '"{fileName}" dosyası "{directoryName}" klasörüne kaydedildi.',
      downloadOrRetry:
        'PDF hâlâ indirilmeye hazır. İndirebilir veya bir klasöre yeniden kaydetmeyi deneyebilirsiniz.',
      queued: 'Dönüştürme için kuyruğa alındı.',
      processing: 'Belge dönüştürülüyor...',
      completed: 'Dönüştürme tamamlandı.',
      failed: 'Dönüştürme başarısız oldu.',
      unexpectedError: 'Dönüştürme sırasında beklenmeyen bir hata oluştu.'
    }
  }
} as const;

type AppCopy = (typeof APP_COPY)[AppLanguage];

const KNOWN_MESSAGE_TRANSLATIONS: Record<string, Record<AppLanguage, string>> = {
  'The file field is required.': {
    en: 'The file field is required.',
    tr: 'Dosya alanı zorunludur.'
  },
  'The uploaded file cannot be empty.': {
    en: 'The uploaded file cannot be empty.',
    tr: 'Yüklenen dosya boş olamaz.'
  },
  'The file size cannot exceed 50 MB.': {
    en: 'The file size cannot exceed 50 MB.',
    tr: 'Dosya boyutu 50 MB sınırını aşamaz.'
  },
  'The targetFormat field is required.': {
    en: 'The targetFormat field is required.',
    tr: 'targetFormat alanı zorunludur.'
  },
  'The file extension could not be detected.': {
    en: 'The file extension could not be detected.',
    tr: 'Dosya uzantısı algılanamadı.'
  },
  'The source file extension is not supported.': {
    en: 'The source file extension is not supported.',
    tr: 'Kaynak dosya uzantısı desteklenmiyor.'
  },
  'The target format is not supported.': {
    en: 'The target format is not supported.',
    tr: 'Hedef format desteklenmiyor.'
  },
  'This conversion combination is not supported.': {
    en: 'This conversion combination is not supported.',
    tr: 'Bu dönüştürme kombinasyonu desteklenmiyor.'
  },
  'The job could not be found.': {
    en: 'The job could not be found.',
    tr: 'İş kaydı bulunamadı.'
  },
  'The converted file is not ready yet.': {
    en: 'The converted file is not ready yet.',
    tr: 'Dönüştürülen dosya henüz hazır değil.'
  },
  'The converted file could not be found on disk.': {
    en: 'The converted file could not be found on disk.',
    tr: 'Dönüştürülen dosya diskte bulunamadı.'
  },
  'The source file could not be found.': {
    en: 'The source file could not be found.',
    tr: 'Kaynak dosya bulunamadı.'
  },
  'The job directory could not be resolved.': {
    en: 'The job directory could not be resolved.',
    tr: 'İş klasörü çözümlenemedi.'
  },
  'The LibreOffice process could not be started.': {
    en: 'The LibreOffice process could not be started.',
    tr: 'LibreOffice işlemi başlatılamadı.'
  },
  'The LibreOffice conversion timed out.': {
    en: 'The LibreOffice conversion timed out.',
    tr: 'LibreOffice dönüştürme işlemi zaman aşımına uğradı.'
  },
  'LibreOffice finished, but the target file could not be found.': {
    en: 'LibreOffice finished, but the target file could not be found.',
    tr: 'LibreOffice tamamlandı ancak hedef dosya bulunamadı.'
  },
  'The LibreOffice executable could not be found. Set LibreOffice:ProgramPath or use a local appsettings override.': {
    en: 'The LibreOffice executable could not be found. Set LibreOffice:ProgramPath or use a local appsettings override.',
    tr: "LibreOffice çalıştırılabilir dosyası bulunamadı. LibreOffice:ProgramPath değerini ayarlayın veya yerel bir appsettings override'u kullanın."
  },
  'The LibreOffice working directory could not be resolved.': {
    en: 'The LibreOffice working directory could not be resolved.',
    tr: 'LibreOffice çalışma klasörü çözümlenemedi.'
  },
  'Choose a source file before starting the conversion.': {
    en: 'Choose a source file before starting the conversion.',
    tr: 'Dönüştürmeyi başlatmadan önce bir kaynak dosya seçin.'
  },
  'This browser does not support saving directly into a chosen folder. Use the download option instead.': {
    en: 'This browser does not support saving directly into a chosen folder. Use the download option instead.',
    tr: 'Bu tarayıcı doğrudan seçilen klasöre kaydetmeyi desteklemiyor. Bunun yerine indirme seçeneğini kullanın.'
  },
  'An unexpected error occurred during conversion.': {
    en: 'An unexpected error occurred during conversion.',
    tr: 'Dönüştürme sırasında beklenmeyen bir hata oluştu.'
  },
  'ConverterApp could not write to the selected folder. Check folder permissions or choose a different folder.': {
    en: 'ConverterApp could not write to the selected folder. Check folder permissions or choose a different folder.',
    tr: 'ConverterApp secilen klasore yazamadi. Klasor izinlerini kontrol edin veya baska bir klasor secin.'
  }
};

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App implements OnDestroy {
  private static readonly themeStorageKey = 'converter-app-theme';
  private static readonly languageStorageKey = 'converter-app-language';

  private readonly converterApi = inject(ConverterApiService);
  private readonly cdr = inject(ChangeDetectorRef);

  private selectedFile: File | null = null;
  private pollingSubscription: Subscription | null = null;
  private isDestroyed = false;
  private lastSaveFileName = '';
  private lastSaveDirectoryName = '';
  private localSaveState: 'idle' | 'ready' | 'saving' | 'saved' | 'retry' = 'idle';

  protected readonly acceptedExtensions = '.doc,.docx,.odt,.xls,.xlsx,.ods,.ppt,.pptx,.odp';
  protected readonly targetFormats = ['pdf'] as const;
  protected readonly languageOptions = ['en', 'tr'] as const;
  protected theme: AppTheme = 'light';
  protected language: AppLanguage = 'en';

  protected selectedFileName = '';
  protected targetFormat = 'pdf';
  protected isSubmitting = false;
  protected isPickingOutputDirectory = false;
  protected isSavingOutput = false;
  protected isDownloading = false;
  protected errorMessage = '';
  protected localSaveMessage = '';
  protected localSaveErrorMessage = '';
  protected savedOutputLocation = '';
  protected currentJob: ConversionJob | null = null;
  protected isFormatsExpanded = false;
  protected activeWorkflowStepId = 'choose';

  constructor() {
    this.initializeTheme();
    this.initializeLanguage();
    this.syncSelectedFileName();
  }

  ngOnDestroy(): void {
    this.isDestroyed = true;
    this.stopPolling();
  }

  protected get isDarkTheme(): boolean {
    return this.theme === 'dark';
  }

  protected get copy(): AppCopy {
    return APP_COPY[this.language];
  }

  protected get tracks(): readonly ConversionTrack[] {
    return this.copy.tracks;
  }

  protected get workflowSteps(): readonly WorkflowStep[] {
    return this.copy.workflowSteps;
  }

  protected get heroNotes(): readonly HeroNote[] {
    return this.copy.hero.notes;
  }

  protected get themeButtonLabel(): string {
    return this.isDarkTheme
      ? this.copy.themeSwitchToLight
      : this.copy.themeSwitchToDark;
  }

  protected get languageSwitcherLabel(): string {
    return this.copy.languageSwitcherLabel;
  }

  protected toggleTheme(): void {
    this.theme = this.theme === 'light'
      ? 'dark'
      : 'light';

    this.applyTheme(this.theme);
    this.persistTheme(this.theme);
    this.refreshView();
  }

  protected setLanguage(language: AppLanguage): void {
    if (this.language === language) {
      return;
    }

    this.language = language;
    this.persistLanguage(language);
    this.syncSelectedFileName();

    if (this.currentJob) {
      this.currentJob = this.normalizeJob(this.currentJob);
    }

    this.errorMessage = this.translateKnownMessage(this.errorMessage);
    this.localSaveErrorMessage = this.translateKnownMessage(this.localSaveErrorMessage);
    this.refreshLocalizedSaveMessage();
    this.refreshView();
  }

  protected getLanguageButtonTitle(language: AppLanguage): string {
    return LANGUAGE_OPTION_LABELS[language];
  }

  protected toggleFormatsPanel(): void {
    this.isFormatsExpanded = !this.isFormatsExpanded;
  }

  protected selectWorkflowStep(stepId: string): void {
    this.activeWorkflowStepId = stepId;
  }

  protected onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;

    this.selectedFile = file;
    this.syncSelectedFileName();
    this.resetUiState();
  }

  protected onTargetFormatChange(event: Event): void {
    const select = event.target as HTMLSelectElement;
    this.targetFormat = select.value;
    this.resetUiState();
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();

    if (!this.selectedFile) {
      this.errorMessage = this.copy.messages.chooseSourceFile;
      this.refreshView();
      return;
    }

    this.stopPolling();
    this.errorMessage = '';
    this.isSubmitting = true;
    this.isSavingOutput = false;
    this.isDownloading = false;
    this.localSaveMessage = '';
    this.localSaveErrorMessage = '';
    this.savedOutputLocation = '';
    this.currentJob = this.createQueuedPreview(this.selectedFile, this.targetFormat);
    this.refreshView();

    this.converterApi.createJob(this.selectedFile, this.targetFormat).subscribe({
      next: (response) => {
        if (!this.currentJob) {
          return;
        }

        this.currentJob = {
          ...this.currentJob,
          id: response.jobId
        };

        this.refreshView();
        this.startPolling(response);
      },
      error: (error: unknown) => {
        this.isSubmitting = false;
        this.currentJob = null;
        this.errorMessage = this.extractErrorMessage(error);
        this.refreshView();
      }
    });
  }

  protected get canSubmit(): boolean {
    return this.selectedFile !== null && !this.isSubmitting;
  }

  protected get submitButtonText(): string {
    if (!this.isSubmitting) {
      return this.copy.buttons.convert;
    }

    if (!this.currentJob || this.currentJob.status === 'Queued') {
      return this.copy.buttons.queueing;
    }

    if (this.currentJob.status === 'Processing') {
      return this.copy.buttons.converting;
    }

    return this.copy.buttons.working;
  }

  protected get shouldShowProgress(): boolean {
    return this.currentJob !== null &&
      (this.currentJob.status === 'Queued' || this.currentJob.status === 'Processing');
  }

  protected get shouldShowSuccess(): boolean {
    return this.currentJob?.status === 'Completed';
  }

  protected get shouldShowFailure(): boolean {
    return this.currentJob?.status === 'Failed' || this.errorMessage.length > 0;
  }

  protected get preferredOutputFileName(): string | null {
    if (!this.currentJob) {
      return null;
    }

    return this.buildPreferredOutputFileName(this.currentJob);
  }

  protected get progressValue(): number {
    return this.currentJob?.progress ?? 0;
  }

  protected get progressTitle(): string {
    return this.currentJob?.message ?? this.copy.status.preparingConversion;
  }

  protected get failureMessage(): string {
    if (this.currentJob?.status === 'Failed' && this.currentJob.errorMessage) {
      return this.currentJob.errorMessage;
    }

    return this.errorMessage;
  }

  protected get saveToFolderButtonText(): string {
    if (this.isPickingOutputDirectory) {
      return this.copy.buttons.choosingFolder;
    }

    return this.isSavingOutput
      ? this.copy.buttons.saving
      : this.copy.buttons.saveToFolder;
  }

  protected get downloadButtonText(): string {
    return this.isDownloading
      ? this.copy.buttons.preparingDownload
      : this.copy.buttons.download;
  }

  protected async onDownloadFile(): Promise<void> {
    if (this.currentJob?.status !== 'Completed' || !this.currentJob.id) {
      return;
    }

    const fileName = this.buildPreferredOutputFileName(this.currentJob);

    this.isDownloading = true;
    this.localSaveErrorMessage = '';
    this.refreshView();

    try {
      const pdfBlob = await firstValueFrom(this.converterApi.downloadJobFile(this.currentJob.id));
      const objectUrl = URL.createObjectURL(pdfBlob);
      const anchor = document.createElement('a');

      anchor.href = objectUrl;
      anchor.download = fileName;
      anchor.rel = 'noopener';
      anchor.click();

      queueMicrotask(() => URL.revokeObjectURL(objectUrl));
    } catch (error: unknown) {
      this.localSaveErrorMessage = this.extractErrorMessage(error);
    } finally {
      this.isDownloading = false;
      this.refreshView();
    }
  }

  protected async onSaveToSelectedFolder(): Promise<void> {
    if (this.currentJob?.status !== 'Completed' || this.isPickingOutputDirectory || this.isSavingOutput) {
      return;
    }

    this.isPickingOutputDirectory = true;
    this.localSaveErrorMessage = '';
    this.refreshView();

    const desktopApi = this.getDesktopApi();

    if (desktopApi) {
      const selectedDirectory = await this.pickDesktopOutputDirectory(desktopApi);

      this.isPickingOutputDirectory = false;
      this.refreshView();

      if (!selectedDirectory) {
        return;
      }

      await this.saveCompletedFileToDesktopDirectory(this.currentJob, selectedDirectory, desktopApi);
      return;
    }

    const directoryHandle = await this.pickOutputDirectory();

    this.isPickingOutputDirectory = false;
    this.refreshView();

    if (!directoryHandle) {
      return;
    }

    await this.saveCompletedFile(this.currentJob, directoryHandle);
  }

  private startPolling(response: ConversionJobStartResponse): void {
    this.stopPolling();

    this.fetchJobStatus(response.jobId);

    this.pollingSubscription = interval(1000)
      .pipe(
        switchMap(() => this.converterApi.getJobStatus(response.jobId)),
        takeWhile(
          (job) => job.status === 'Queued' || job.status === 'Processing',
          true
        )
      )
      .subscribe({
        next: (job) => {
          this.applyJobUpdate(job);
        },
        error: (error: unknown) => {
          this.isSubmitting = false;
          this.errorMessage = this.extractErrorMessage(error);
          this.stopPolling();
          this.refreshView();
        },
        complete: () => {
          this.isSubmitting = false;
          this.stopPolling();
          this.refreshView();
        }
      });
  }

  private fetchJobStatus(jobId: string): void {
    this.converterApi.getJobStatus(jobId).subscribe({
      next: (job) => {
        this.applyJobUpdate(job);
      },
      error: (error: unknown) => {
        this.isSubmitting = false;
        this.errorMessage = this.extractErrorMessage(error);
        this.stopPolling();
        this.refreshView();
      }
    });
  }

  private applyJobUpdate(job: ConversionJob): void {
    this.currentJob = this.normalizeJob(job);

    if (this.currentJob.status === 'Completed' || this.currentJob.status === 'Failed') {
      this.isSubmitting = false;
      this.stopPolling();
    }

    if (this.currentJob.status === 'Completed') {
      this.handleCompletedJob();
    }

    this.refreshView();
  }

  private stopPolling(): void {
    this.pollingSubscription?.unsubscribe();
    this.pollingSubscription = null;
  }

  private initializeTheme(): void {
    const storedTheme = this.readStoredTheme();
    this.theme = storedTheme ?? 'light';
    this.applyTheme(this.theme);
  }

  private initializeLanguage(): void {
    const storedLanguage = this.readStoredLanguage();
    this.language = storedLanguage ?? this.detectDefaultLanguage();
  }

  private readStoredTheme(): AppTheme | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const storedTheme = window.localStorage.getItem(App.themeStorageKey);

    return storedTheme === 'dark' || storedTheme === 'light'
      ? storedTheme
      : null;
  }

  private persistTheme(theme: AppTheme): void {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(App.themeStorageKey, theme);
    }
  }

  private readStoredLanguage(): AppLanguage | null {
    if (typeof window === 'undefined') {
      return null;
    }

    const storedLanguage = window.localStorage.getItem(App.languageStorageKey);

    return storedLanguage === 'en' || storedLanguage === 'tr'
      ? storedLanguage
      : null;
  }

  private detectDefaultLanguage(): AppLanguage {
    if (typeof navigator === 'undefined') {
      return 'en';
    }

    return navigator.language.toLowerCase().startsWith('tr')
      ? 'tr'
      : 'en';
  }

  private persistLanguage(language: AppLanguage): void {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(App.languageStorageKey, language);
    }
  }

  private applyTheme(theme: AppTheme): void {
    if (typeof document === 'undefined') {
      return;
    }

    document.documentElement.dataset['theme'] = theme;
  }

  private resetUiState(): void {
    this.errorMessage = '';
    this.currentJob = null;
    this.isSubmitting = false;
    this.isPickingOutputDirectory = false;
    this.isSavingOutput = false;
    this.isDownloading = false;
    this.localSaveMessage = '';
    this.localSaveErrorMessage = '';
    this.savedOutputLocation = '';
    this.lastSaveFileName = '';
    this.lastSaveDirectoryName = '';
    this.localSaveState = 'idle';
    this.stopPolling();
    this.refreshView();
  }

  private handleCompletedJob(): void {
    this.localSaveState = 'ready';
    this.localSaveErrorMessage = '';
    this.savedOutputLocation = '';
    this.refreshLocalizedSaveMessage();
  }

  private async pickOutputDirectory(): Promise<BrowserDirectoryHandle | null> {
    this.localSaveErrorMessage = '';

    const pickerWindow = this.getDirectoryPickerWindow();

    if (!pickerWindow?.showDirectoryPicker) {
      this.localSaveErrorMessage = this.copy.messages.folderSaveUnsupported;
      this.refreshView();
      return null;
    }

    try {
      return await pickerWindow.showDirectoryPicker({ mode: 'readwrite' });
    } catch (error: unknown) {
      if (this.isAbortError(error)) {
        return null;
      }

      if (this.isFilePickerAlreadyActiveError(error)) {
        this.localSaveErrorMessage = this.copy.messages.folderPickerActive;
        this.refreshView();
        return null;
      }

      this.localSaveErrorMessage = this.extractErrorMessage(error);
      this.refreshView();
      return null;
    }
  }

  private async saveCompletedFile(
    job: ConversionJob,
    directoryHandle: BrowserDirectoryHandle
  ): Promise<void> {
    if (!job.id) {
      return;
    }

    const requestedFileName = this.buildPreferredOutputFileName(job);
    const fileName = await this.buildAvailableLocalFileName(directoryHandle, requestedFileName);

    this.isSavingOutput = true;
    this.localSaveErrorMessage = '';
    this.lastSaveFileName = fileName;
    this.lastSaveDirectoryName = directoryHandle.name;
    this.localSaveState = 'saving';
    this.savedOutputLocation = '';
    this.refreshLocalizedSaveMessage();
    this.refreshView();

    try {
      const pdfBlob = await firstValueFrom(this.converterApi.downloadJobFile(job.id));
      const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();

      try {
        await writable.write(pdfBlob);
        await writable.close();
      } catch (writeError: unknown) {
        if (typeof writable.abort === 'function') {
          await writable.abort(writeError);
        }

        throw writeError;
      }

      this.localSaveState = 'saved';
      this.refreshLocalizedSaveMessage();
      this.savedOutputLocation = `${directoryHandle.name}/${fileName}`;
    } catch (error: unknown) {
      this.localSaveState = 'retry';
      this.refreshLocalizedSaveMessage();
      this.localSaveErrorMessage = this.extractErrorMessage(error);
      this.savedOutputLocation = '';
    } finally {
      this.isSavingOutput = false;
      this.refreshView();
    }
  }

  private async pickDesktopOutputDirectory(
    desktopApi: ConverterDesktopApi
  ): Promise<DesktopDirectorySelection | null> {
    try {
      return await desktopApi.pickOutputDirectory();
    } catch (error: unknown) {
      this.localSaveErrorMessage = this.extractErrorMessage(error);
      this.refreshView();
      return null;
    }
  }

  private async saveCompletedFileToDesktopDirectory(
    job: ConversionJob,
    directory: DesktopDirectorySelection,
    desktopApi: ConverterDesktopApi
  ): Promise<void> {
    if (!job.id) {
      return;
    }

    const requestedFileName = this.buildPreferredOutputFileName(job);

    this.isSavingOutput = true;
    this.localSaveErrorMessage = '';
    this.lastSaveFileName = requestedFileName;
    this.lastSaveDirectoryName = directory.name;
    this.localSaveState = 'saving';
    this.savedOutputLocation = '';
    this.refreshLocalizedSaveMessage();
    this.refreshView();

    try {
      const pdfBlob = await firstValueFrom(this.converterApi.downloadJobFile(job.id));
      const fileBytes = new Uint8Array(await pdfBlob.arrayBuffer());
      const result = await desktopApi.saveFileToDirectory(directory.path, requestedFileName, fileBytes);

      this.lastSaveFileName = result.fileName;
      this.lastSaveDirectoryName = result.directoryName;
      this.localSaveState = 'saved';
      this.refreshLocalizedSaveMessage();
      this.savedOutputLocation = result.filePath;
    } catch (error: unknown) {
      this.localSaveState = 'retry';
      this.refreshLocalizedSaveMessage();
      this.localSaveErrorMessage = this.extractErrorMessage(error);
      this.savedOutputLocation = '';
    } finally {
      this.isSavingOutput = false;
      this.refreshView();
    }
  }

  private getDirectoryPickerWindow(): WindowWithDirectoryPicker | null {
    return typeof window === 'undefined'
      ? null
      : window as WindowWithDirectoryPicker;
  }

  private getDesktopApi(): ConverterDesktopApi | null {
    if (typeof window === 'undefined') {
      return null;
    }

    return (window as WindowWithDesktopApi).converterDesktop ?? null;
  }

  private isAbortError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'AbortError';
  }

  private isFilePickerAlreadyActiveError(error: unknown): boolean {
    if (error instanceof DOMException) {
      return error.message.includes('File picker already active');
    }

    if (error instanceof Error) {
      return error.message.includes('File picker already active');
    }

    return false;
  }

  private createQueuedPreview(file: File, targetFormat: string): ConversionJob {
    return {
      id: '',
      originalFileName: file.name,
      sourceExtension: this.getFileExtension(file.name),
      targetFormat,
      status: 'Queued',
      progress: 10,
      message: this.copy.messages.queued,
      outputFileName: this.buildOutputFileNameFromParts(file.name, targetFormat),
      outputFilePath: null,
      errorMessage: null,
      createdAtUtc: '',
      updatedAtUtc: ''
    };
  }

  private getFileExtension(fileName: string): string {
    const dotIndex = fileName.lastIndexOf('.');

    if (dotIndex < 0) {
      return '';
    }

    return fileName.slice(dotIndex).toLowerCase();
  }

  private buildFallbackOutputFileName(job: ConversionJob): string {
    return this.buildOutputFileNameFromParts(job.originalFileName, job.targetFormat);
  }

  private buildPreferredOutputFileName(job: ConversionJob): string {
    return this.buildOutputFileNameFromParts(job.originalFileName, job.targetFormat);
  }

  private buildOutputFileNameFromParts(originalFileName: string, targetFormat: string): string {
    const sourceFileName = originalFileName;
    const lastDotIndex = sourceFileName.lastIndexOf('.');
    const baseName = lastDotIndex > 0
      ? sourceFileName.slice(0, lastDotIndex)
      : sourceFileName;

    return `${baseName}.${targetFormat}`;
  }

  private normalizeJob(job: ConversionJob): ConversionJob {
    return {
      ...job,
      message: this.localizeJobMessage(job),
      outputFileName: this.buildPreferredOutputFileName(job)
    };
  }

  private localizeJobMessage(job: ConversionJob): string {
    switch (job.status) {
      case 'Queued':
        return this.copy.messages.queued;
      case 'Processing':
        return this.copy.messages.processing;
      case 'Completed':
        return this.copy.messages.completed;
      case 'Failed':
        return this.copy.messages.failed;
      default:
        return this.translateKnownMessage(job.message);
    }
  }

  private async buildAvailableLocalFileName(
    directoryHandle: BrowserDirectoryHandle,
    desiredFileName: string
  ): Promise<string> {
    const lastDotIndex = desiredFileName.lastIndexOf('.');
    const hasExtension = lastDotIndex > 0;
    const baseName = hasExtension
      ? desiredFileName.slice(0, lastDotIndex)
      : desiredFileName;
    const extension = hasExtension
      ? desiredFileName.slice(lastDotIndex)
      : '';

    let counter = 0;

    while (true) {
      const candidate = counter === 0
        ? desiredFileName
        : `${baseName} (${counter})${extension}`;

      if (!await this.doesFileExist(directoryHandle, candidate)) {
        return candidate;
      }

      counter++;
    }
  }

  private async doesFileExist(
    directoryHandle: BrowserDirectoryHandle,
    fileName: string
  ): Promise<boolean> {
    try {
      await directoryHandle.getFileHandle(fileName);
      return true;
    } catch (error: unknown) {
      if (this.isNotFoundError(error)) {
        return false;
      }

      throw error;
    }
  }

  private extractErrorMessage(error: unknown): string {
    if (typeof error === 'string' && error.trim().length > 0) {
      return this.translateKnownMessage(error);
    }

    if (error instanceof Error && error.message.trim().length > 0) {
      return this.translateKnownMessage(error.message);
    }

    if (typeof error === 'object' && error !== null) {
      const typedError = error as {
        error?: { message?: string };
        message?: string;
      };

      if (typedError.error?.message) {
        return this.translateKnownMessage(typedError.error.message);
      }

      if (typedError.message) {
        return this.translateKnownMessage(typedError.message);
      }
    }

    return this.copy.messages.unexpectedError;
  }

  private refreshView(): void {
    if (!this.isDestroyed) {
      this.cdr.detectChanges();
    }
  }

  private isNotFoundError(error: unknown): boolean {
    return error instanceof DOMException && error.name === 'NotFoundError';
  }

  private syncSelectedFileName(): void {
    this.selectedFileName = this.selectedFile?.name ?? this.copy.noFileSelected;
  }

  private translateKnownMessage(message: string): string {
    if (!message) {
      return message;
    }

    for (const [sourceMessage, translations] of Object.entries(KNOWN_MESSAGE_TRANSLATIONS)) {
      const candidates = [sourceMessage, translations.en, translations.tr];

      if (candidates.includes(message)) {
        return translations[this.language];
      }

      const prefixMatch = candidates.find((candidate) => message.startsWith(candidate));

      if (prefixMatch) {
        return message.replace(prefixMatch, translations[this.language]);
      }
    }

    return message;
  }

  private refreshLocalizedSaveMessage(): void {
    switch (this.localSaveState) {
      case 'ready':
        this.localSaveMessage = this.copy.messages.pdfReady;
        break;
      case 'saving':
        this.localSaveMessage = this.formatMessage(this.copy.messages.savingToFolder, {
          fileName: this.lastSaveFileName,
          directoryName: this.lastSaveDirectoryName
        });
        break;
      case 'saved':
        this.localSaveMessage = this.formatMessage(this.copy.messages.savedToFolder, {
          fileName: this.lastSaveFileName,
          directoryName: this.lastSaveDirectoryName
        });
        break;
      case 'retry':
        this.localSaveMessage = this.copy.messages.downloadOrRetry;
        break;
      default:
        this.localSaveMessage = '';
        break;
    }
  }

  private formatMessage(
    template: string,
    values: { fileName?: string; directoryName?: string }
  ): string {
    return template
      .replace('{fileName}', values.fileName ?? '')
      .replace('{directoryName}', values.directoryName ?? '');
  }
}
