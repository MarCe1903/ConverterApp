import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { API_BASE_PATH } from '../config/api-config';
import { ConversionJob } from '../models/conversion-job';
import { ConversionJobStartResponse } from '../models/conversion-job-start-response';

@Injectable({
  providedIn: 'root'
})
export class ConverterApiService {
  private readonly http = inject(HttpClient);

  createJob(file: File, targetFormat: string): Observable<ConversionJobStartResponse> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('targetFormat', targetFormat);

    return this.http.post<ConversionJobStartResponse>(`${API_BASE_PATH}/convert`, formData);
  }

  getJobStatus(jobId: string): Observable<ConversionJob> {
    return this.http.get<ConversionJob>(`${API_BASE_PATH}/convert/jobs/${jobId}`);
  }

  downloadJobFile(jobId: string): Observable<Blob> {
    return this.http.get(`${API_BASE_PATH}/convert/jobs/${jobId}/download`, {
      responseType: 'blob'
    });
  }
}
