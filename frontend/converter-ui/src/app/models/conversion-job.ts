export type ConversionJobStatus =
  | 'Queued'
  | 'Processing'
  | 'Completed'
  | 'Failed';

export type ConversionJob = {
  id: string;
  originalFileName: string;
  sourceExtension: string;
  targetFormat: string;
  status: ConversionJobStatus;
  progress: number;
  message: string;
  outputFileName: string | null;
  outputFilePath: string | null;
  errorMessage: string | null;
  createdAtUtc: string;
  updatedAtUtc: string;
};
