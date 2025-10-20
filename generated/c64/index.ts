/* eslint-disable */
/* tslint:disable */
/*
 * ---------------------------------------------------------------
 * ## THIS FILE WAS GENERATED VIA SWAGGER-TYPESCRIPT-API        ##
 * ##                                                           ##
 * ## AUTHOR: acacode                                           ##
 * ## SOURCE: https://github.com/acacode/swagger-typescript-api ##
 * ---------------------------------------------------------------
 */

export interface ErrorResponse {
  errors: string[];
}

export type VersionResponse = ErrorResponse & {
  version: string;
};

export type InfoResponse = ErrorResponse & {
  product?: string;
  firmware_version?: string;
  fpga_version?: string;
  /** Present on Ultimate 64 devices. */
  core_version?: string;
  hostname?: string;
  unique_id?: string;
};

export type ConfigListResponse = ErrorResponse & {
  categories?: string[];
};

export type ConfigCategoryResponse = ErrorResponse & Record<string, object>;

export type ConfigItemResponse = ErrorResponse & Record<string, object>;

export type MemoryReadJson = ErrorResponse & {
  /** Base64 encoded bytes. */
  data?: string | number[];
};

export type MemoryDebugResponse = ErrorResponse & {
  /** Hex string read from $D7FF. */
  value: string;
};

export type DriveListResponse = ErrorResponse & {
  drives?: Record<
    string,
    {
      enabled?: boolean;
      bus_id?: number;
      type?: string;
      rom?: string;
      image_file?: string;
      image_path?: string;
      last_error?: string;
      partitions?: {
        id?: number;
        path?: string;
      }[];
    }
  >[];
};

export type FileInfoResponse = ErrorResponse & {
  info?: Record<string, any>;
};

export type MachineActionResponse = ErrorResponse;

export type RunnerActionResponse = ErrorResponse;

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, HeadersDefaults, ResponseType } from "axios";

export type QueryParamsType = Record<string | number, any>;

export interface FullRequestParams extends Omit<AxiosRequestConfig, "data" | "params" | "url" | "responseType"> {
  /** set parameter to `true` for call `securityWorker` for this request */
  secure?: boolean;
  /** request path */
  path: string;
  /** content type of request body */
  type?: ContentType;
  /** query params */
  query?: QueryParamsType;
  /** format of response (i.e. response.json() -> format: "json") */
  format?: ResponseType;
  /** request body */
  body?: unknown;
}

export type RequestParams = Omit<FullRequestParams, "body" | "method" | "query" | "path">;

export interface ApiConfig<SecurityDataType = unknown> extends Omit<AxiosRequestConfig, "data" | "cancelToken"> {
  securityWorker?: (
    securityData: SecurityDataType | null,
  ) => Promise<AxiosRequestConfig | void> | AxiosRequestConfig | void;
  secure?: boolean;
  format?: ResponseType;
}

export enum ContentType {
  Json = "application/json",
  FormData = "multipart/form-data",
  UrlEncoded = "application/x-www-form-urlencoded",
  Text = "text/plain",
}

export class HttpClient<SecurityDataType = unknown> {
  public instance: AxiosInstance;
  private securityData: SecurityDataType | null = null;
  private securityWorker?: ApiConfig<SecurityDataType>["securityWorker"];
  private secure?: boolean;
  private format?: ResponseType;

  constructor({ securityWorker, secure, format, ...axiosConfig }: ApiConfig<SecurityDataType> = {}) {
    this.instance = axios.create({ ...axiosConfig, baseURL: axiosConfig.baseURL || "http://c64u" });
    this.secure = secure;
    this.format = format;
    this.securityWorker = securityWorker;
  }

  public setSecurityData = (data: SecurityDataType | null) => {
    this.securityData = data;
  };

  protected mergeRequestParams(params1: AxiosRequestConfig, params2?: AxiosRequestConfig): AxiosRequestConfig {
    const method = params1.method || (params2 && params2.method);

    return {
      ...this.instance.defaults,
      ...params1,
      ...(params2 || {}),
      headers: {
        ...((method && this.instance.defaults.headers[method.toLowerCase() as keyof HeadersDefaults]) || {}),
        ...(params1.headers || {}),
        ...((params2 && params2.headers) || {}),
      },
    };
  }

  protected stringifyFormItem(formItem: unknown) {
    if (typeof formItem === "object" && formItem !== null) {
      return JSON.stringify(formItem);
    } else {
      return `${formItem}`;
    }
  }

  protected createFormData(input: Record<string, unknown>): FormData {
    return Object.keys(input || {}).reduce((formData, key) => {
      const property = input[key];
      const propertyContent: any[] = property instanceof Array ? property : [property];

      for (const formItem of propertyContent) {
        const isFileType = formItem instanceof Blob || formItem instanceof File;
        formData.append(key, isFileType ? formItem : this.stringifyFormItem(formItem));
      }

      return formData;
    }, new FormData());
  }

  public request = async <T = any, _E = any>({
    secure,
    path,
    type,
    query,
    format,
    body,
    ...params
  }: FullRequestParams): Promise<AxiosResponse<T>> => {
    const secureParams =
      ((typeof secure === "boolean" ? secure : this.secure) &&
        this.securityWorker &&
        (await this.securityWorker(this.securityData))) ||
      {};
    const requestParams = this.mergeRequestParams(params, secureParams);
    const responseFormat = format || this.format || undefined;

    if (type === ContentType.FormData && body && body !== null && typeof body === "object") {
      body = this.createFormData(body as Record<string, unknown>);
    }

    if (type === ContentType.Text && body && body !== null && typeof body !== "string") {
      body = JSON.stringify(body);
    }

    return this.instance.request({
      ...requestParams,
      headers: {
        ...(requestParams.headers || {}),
        ...(type && type !== ContentType.FormData ? { "Content-Type": type } : {}),
      },
      params: query,
      responseType: responseFormat,
      data: body,
      url: path,
    });
  };
}

/**
 * @title Ultimate 64 REST API
 * @version 1.0.0
 * @baseUrl http://c64u
 *
 * This OpenAPI document captures the public HTTP interface described in the
 * official Ultimate 64 REST API documentation. Responses always include an
 * `errors` array unless noted. When a network password is configured, clients
 * must supply the `X-Password` header on every request.
 */
export class Api<SecurityDataType extends unknown> {
  http: HttpClient<SecurityDataType>;

  constructor(http: HttpClient<SecurityDataType>) {
    this.http = http;
  }

  v1 = {
    /**
     * No description
     *
     * @name VersionList
     * @summary Get API version
     * @request GET:/v1/version
     * @secure
     */
    versionList: (params: RequestParams = {}) =>
      this.http.request<VersionResponse, any>({
        path: `/v1/version`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name InfoList
     * @summary Get device information
     * @request GET:/v1/info
     * @secure
     */
    infoList: (params: RequestParams = {}) =>
      this.http.request<InfoResponse, any>({
        path: `/v1/info`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name RunnersSidplayUpdate
     * @summary Play SID from filesystem
     * @request PUT:/v1/runners:sidplay
     * @secure
     */
    runnersSidplayUpdate: (
      sidplay: string,
      query: {
        file: string;
        /** @min 0 */
        songnr?: number;
      },
      params: RequestParams = {},
    ) =>
      this.http.request<RunnerActionResponse, any>({
        path: `/v1/runners${sidplay}`,
        method: "PUT",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name RunnersSidplayCreate
     * @summary Play uploaded SID
     * @request POST:/v1/runners:sidplay
     * @secure
     */
    runnersSidplayCreate: (
      sidplay: string,
      data: {
        /** @format binary */
        sid: File;
        /** @format binary */
        songlengths?: File;
      },
      query?: {
        /** @min 0 */
        songnr?: number;
      },
      params: RequestParams = {},
    ) =>
      this.http.request<RunnerActionResponse, any>({
        path: `/v1/runners${sidplay}`,
        method: "POST",
        query: query,
        body: data,
        secure: true,
        type: ContentType.FormData,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name RunnersModplayUpdate
     * @summary Play MOD from filesystem
     * @request PUT:/v1/runners:modplay
     * @secure
     */
    runnersModplayUpdate: (
      modplay: string,
      query: {
        file: string;
      },
      params: RequestParams = {},
    ) =>
      this.http.request<RunnerActionResponse, any>({
        path: `/v1/runners${modplay}`,
        method: "PUT",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name RunnersModplayCreate
     * @summary Play uploaded MOD
     * @request POST:/v1/runners:modplay
     * @secure
     */
    runnersModplayCreate: (modplay: string, data: File, params: RequestParams = {}) =>
      this.http.request<RunnerActionResponse, any>({
        path: `/v1/runners${modplay}`,
        method: "POST",
        body: data,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name RunnersLoadPrgUpdate
     * @summary Load PRG from filesystem
     * @request PUT:/v1/runners:load_prg
     * @secure
     */
    runnersLoadPrgUpdate: (
      loadPrg: string,
      query: {
        file: string;
      },
      params: RequestParams = {},
    ) =>
      this.http.request<RunnerActionResponse, any>({
        path: `/v1/runners${loadPrg}`,
        method: "PUT",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name RunnersLoadPrgCreate
     * @summary Load uploaded PRG
     * @request POST:/v1/runners:load_prg
     * @secure
     */
    runnersLoadPrgCreate: (loadPrg: string, data: File, params: RequestParams = {}) =>
      this.http.request<RunnerActionResponse, any>({
        path: `/v1/runners${loadPrg}`,
        method: "POST",
        body: data,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name RunnersRunPrgUpdate
     * @summary Run PRG from filesystem
     * @request PUT:/v1/runners:run_prg
     * @secure
     */
    runnersRunPrgUpdate: (
      runPrg: string,
      query: {
        file: string;
      },
      params: RequestParams = {},
    ) =>
      this.http.request<RunnerActionResponse, any>({
        path: `/v1/runners${runPrg}`,
        method: "PUT",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name RunnersRunPrgCreate
     * @summary Run uploaded PRG
     * @request POST:/v1/runners:run_prg
     * @secure
     */
    runnersRunPrgCreate: (runPrg: string, data: File, params: RequestParams = {}) =>
      this.http.request<RunnerActionResponse, any>({
        path: `/v1/runners${runPrg}`,
        method: "POST",
        body: data,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name RunnersRunCrtUpdate
     * @summary Run cartridge from filesystem
     * @request PUT:/v1/runners:run_crt
     * @secure
     */
    runnersRunCrtUpdate: (
      runCrt: string,
      query: {
        file: string;
      },
      params: RequestParams = {},
    ) =>
      this.http.request<RunnerActionResponse, any>({
        path: `/v1/runners${runCrt}`,
        method: "PUT",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name RunnersRunCrtCreate
     * @summary Run uploaded cartridge
     * @request POST:/v1/runners:run_crt
     * @secure
     */
    runnersRunCrtCreate: (runCrt: string, data: File, params: RequestParams = {}) =>
      this.http.request<RunnerActionResponse, any>({
        path: `/v1/runners${runCrt}`,
        method: "POST",
        body: data,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name ConfigsList
     * @summary List configuration categories
     * @request GET:/v1/configs
     * @secure
     */
    configsList: (params: RequestParams = {}) =>
      this.http.request<ConfigListResponse, any>({
        path: `/v1/configs`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name ConfigsCreate
     * @summary Batch update configuration
     * @request POST:/v1/configs
     * @secure
     */
    configsCreate: (data: Record<string, object>, params: RequestParams = {}) =>
      this.http.request<ErrorResponse, any>({
        path: `/v1/configs`,
        method: "POST",
        body: data,
        secure: true,
        type: ContentType.Json,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name ConfigsDetail
     * @summary Inspect category
     * @request GET:/v1/configs/{category}
     * @secure
     */
    configsDetail: (category: string, params: RequestParams = {}) =>
      this.http.request<ConfigCategoryResponse, any>({
        path: `/v1/configs/${category}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name ConfigsDetail2
     * @summary Inspect configuration item
     * @request GET:/v1/configs/{category}/{item}
     * @originalName configsDetail
     * @duplicate
     * @secure
     */
    configsDetail2: (category: string, item: string, params: RequestParams = {}) =>
      this.http.request<ConfigItemResponse, any>({
        path: `/v1/configs/${category}/${item}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name ConfigsUpdate
     * @summary Update configuration item
     * @request PUT:/v1/configs/{category}/{item}
     * @secure
     */
    configsUpdate: (
      category: string,
      item: string,
      query: {
        value: string;
      },
      params: RequestParams = {},
    ) =>
      this.http.request<ErrorResponse, any>({
        path: `/v1/configs/${category}/${item}`,
        method: "PUT",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name ConfigsLoadFromFlashUpdate
     * @summary Load configuration from flash
     * @request PUT:/v1/configs:load_from_flash
     * @secure
     */
    configsLoadFromFlashUpdate: (loadFromFlash: string, params: RequestParams = {}) =>
      this.http.request<ErrorResponse, any>({
        path: `/v1/configs${loadFromFlash}`,
        method: "PUT",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name ConfigsSaveToFlashUpdate
     * @summary Save configuration to flash
     * @request PUT:/v1/configs:save_to_flash
     * @secure
     */
    configsSaveToFlashUpdate: (saveToFlash: string, params: RequestParams = {}) =>
      this.http.request<ErrorResponse, any>({
        path: `/v1/configs${saveToFlash}`,
        method: "PUT",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name ConfigsResetToDefaultUpdate
     * @summary Reset configuration to defaults
     * @request PUT:/v1/configs:reset_to_default
     * @secure
     */
    configsResetToDefaultUpdate: (resetToDefault: string, params: RequestParams = {}) =>
      this.http.request<ErrorResponse, any>({
        path: `/v1/configs${resetToDefault}`,
        method: "PUT",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name MachineResetUpdate
     * @summary Soft reset machine
     * @request PUT:/v1/machine:reset
     * @secure
     */
    machineResetUpdate: (reset: string, params: RequestParams = {}) =>
      this.http.request<MachineActionResponse, any>({
        path: `/v1/machine${reset}`,
        method: "PUT",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name MachineRebootUpdate
     * @summary Reboot machine
     * @request PUT:/v1/machine:reboot
     * @secure
     */
    machineRebootUpdate: (reboot: string, params: RequestParams = {}) =>
      this.http.request<MachineActionResponse, any>({
        path: `/v1/machine${reboot}`,
        method: "PUT",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name MachinePauseUpdate
     * @summary Pause machine via DMA
     * @request PUT:/v1/machine:pause
     * @secure
     */
    machinePauseUpdate: (pause: string, params: RequestParams = {}) =>
      this.http.request<MachineActionResponse, any>({
        path: `/v1/machine${pause}`,
        method: "PUT",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name MachineResumeUpdate
     * @summary Resume machine from pause
     * @request PUT:/v1/machine:resume
     * @secure
     */
    machineResumeUpdate: (resume: string, params: RequestParams = {}) =>
      this.http.request<MachineActionResponse, any>({
        path: `/v1/machine${resume}`,
        method: "PUT",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name MachinePoweroffUpdate
     * @summary Power off machine
     * @request PUT:/v1/machine:poweroff
     * @secure
     */
    machinePoweroffUpdate: (poweroff: string, params: RequestParams = {}) =>
      this.http.request<MachineActionResponse, any>({
        path: `/v1/machine${poweroff}`,
        method: "PUT",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name MachineMenuButtonUpdate
     * @summary Toggle Ultimate menu button
     * @request PUT:/v1/machine:menu_button
     * @secure
     */
    machineMenuButtonUpdate: (menuButton: string, params: RequestParams = {}) =>
      this.http.request<MachineActionResponse, any>({
        path: `/v1/machine${menuButton}`,
        method: "PUT",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name MachineWritememUpdate
     * @summary Write memory via query data
     * @request PUT:/v1/machine:writemem
     * @secure
     */
    machineWritememUpdate: (
      writemem: string,
      query: {
        /** Hexadecimal start address. */
        address: string;
        /** Hex string representing bytes (≤ 128 bytes). */
        data: string;
      },
      params: RequestParams = {},
    ) =>
      this.http.request<MachineActionResponse, any>({
        path: `/v1/machine${writemem}`,
        method: "PUT",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name MachineWritememCreate
     * @summary Write memory via binary payload
     * @request POST:/v1/machine:writemem
     * @secure
     */
    machineWritememCreate: (
      writemem: string,
      query: {
        /** Hexadecimal start address. */
        address: string;
      },
      data: File,
      params: RequestParams = {},
    ) =>
      this.http.request<MachineActionResponse, any>({
        path: `/v1/machine${writemem}`,
        method: "POST",
        query: query,
        body: data,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name MachineReadmemList
     * @summary Read memory
     * @request GET:/v1/machine:readmem
     * @secure
     */
    machineReadmemList: (
      readmem: string,
      query: {
        /** Hexadecimal start address. */
        address: string;
        /**
         * @min 1
         * @max 4096
         */
        length?: number;
      },
      params: RequestParams = {},
    ) =>
      this.http.request<MemoryReadJson, any>({
        path: `/v1/machine${readmem}`,
        method: "GET",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name MachineDebugregList
     * @summary Read debug register
     * @request GET:/v1/machine:debugreg
     * @secure
     */
    machineDebugregList: (debugreg: string, params: RequestParams = {}) =>
      this.http.request<MemoryDebugResponse, any>({
        path: `/v1/machine${debugreg}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name MachineDebugregUpdate
     * @summary Write debug register
     * @request PUT:/v1/machine:debugreg
     * @secure
     */
    machineDebugregUpdate: (
      debugreg: string,
      query: {
        /** Hexadecimal value to write. */
        value: string;
      },
      params: RequestParams = {},
    ) =>
      this.http.request<MemoryDebugResponse, any>({
        path: `/v1/machine${debugreg}`,
        method: "PUT",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name DrivesList
     * @summary List internal drives
     * @request GET:/v1/drives
     * @secure
     */
    drivesList: (params: RequestParams = {}) =>
      this.http.request<DriveListResponse, any>({
        path: `/v1/drives`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name DrivesMountUpdate
     * @summary Mount disk image from filesystem
     * @request PUT:/v1/drives/{drive}:mount
     * @secure
     */
    drivesMountUpdate: (
      drive: string,
      mount: string,
      query: {
        image: string;
        type?: "d64" | "g64" | "d71" | "g71" | "d81";
        mode?: "readwrite" | "readonly" | "unlinked";
      },
      params: RequestParams = {},
    ) =>
      this.http.request<ErrorResponse, any>({
        path: `/v1/drives/${drive}${mount}`,
        method: "PUT",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name DrivesMountCreate
     * @summary Mount uploaded disk image
     * @request POST:/v1/drives/{drive}:mount
     * @secure
     */
    drivesMountCreate: (
      drive: string,
      mount: string,
      data: File,
      query?: {
        type?: "d64" | "g64" | "d71" | "g71" | "d81";
        mode?: "readwrite" | "readonly" | "unlinked";
      },
      params: RequestParams = {},
    ) =>
      this.http.request<ErrorResponse, any>({
        path: `/v1/drives/${drive}${mount}`,
        method: "POST",
        query: query,
        body: data,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name DrivesResetUpdate
     * @summary Reset drive
     * @request PUT:/v1/drives/{drive}:reset
     * @secure
     */
    drivesResetUpdate: (drive: string, reset: string, params: RequestParams = {}) =>
      this.http.request<ErrorResponse, any>({
        path: `/v1/drives/${drive}${reset}`,
        method: "PUT",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name DrivesRemoveUpdate
     * @summary Remove mounted image
     * @request PUT:/v1/drives/{drive}:remove
     * @secure
     */
    drivesRemoveUpdate: (drive: string, remove: string, params: RequestParams = {}) =>
      this.http.request<ErrorResponse, any>({
        path: `/v1/drives/${drive}${remove}`,
        method: "PUT",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name DrivesOnUpdate
     * @summary Power on drive
     * @request PUT:/v1/drives/{drive}:on
     * @secure
     */
    drivesOnUpdate: (drive: string, on: string, params: RequestParams = {}) =>
      this.http.request<ErrorResponse, any>({
        path: `/v1/drives/${drive}${on}`,
        method: "PUT",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name DrivesOffUpdate
     * @summary Power off drive
     * @request PUT:/v1/drives/{drive}:off
     * @secure
     */
    drivesOffUpdate: (drive: string, off: string, params: RequestParams = {}) =>
      this.http.request<ErrorResponse, any>({
        path: `/v1/drives/${drive}${off}`,
        method: "PUT",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name DrivesLoadRomUpdate
     * @summary Load ROM from filesystem
     * @request PUT:/v1/drives/{drive}:load_rom
     * @secure
     */
    drivesLoadRomUpdate: (
      drive: string,
      loadRom: string,
      query: {
        file: string;
      },
      params: RequestParams = {},
    ) =>
      this.http.request<ErrorResponse, any>({
        path: `/v1/drives/${drive}${loadRom}`,
        method: "PUT",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name DrivesLoadRomCreate
     * @summary Load ROM from upload
     * @request POST:/v1/drives/{drive}:load_rom
     * @secure
     */
    drivesLoadRomCreate: (drive: string, loadRom: string, data: File, params: RequestParams = {}) =>
      this.http.request<ErrorResponse, any>({
        path: `/v1/drives/${drive}${loadRom}`,
        method: "POST",
        body: data,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name DrivesSetModeUpdate
     * @summary Set drive mode
     * @request PUT:/v1/drives/{drive}:set_mode
     * @secure
     */
    drivesSetModeUpdate: (
      drive: string,
      setMode: string,
      query: {
        mode: "1541" | "1571" | "1581";
      },
      params: RequestParams = {},
    ) =>
      this.http.request<ErrorResponse, any>({
        path: `/v1/drives/${drive}${setMode}`,
        method: "PUT",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name StreamsStartUpdate
     * @summary Start data stream
     * @request PUT:/v1/streams/{stream}:start
     * @secure
     */
    streamsStartUpdate: (
      stream: "video" | "audio" | "debug",
      start: string,
      query: {
        /** Target IP address with optional port (ip[:port]). */
        ip: string;
      },
      params: RequestParams = {},
    ) =>
      this.http.request<ErrorResponse, any>({
        path: `/v1/streams/${stream}${start}`,
        method: "PUT",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name StreamsStopUpdate
     * @summary Stop data stream
     * @request PUT:/v1/streams/{stream}:stop
     * @secure
     */
    streamsStopUpdate: (stream: "video" | "audio" | "debug", stop: string, params: RequestParams = {}) =>
      this.http.request<ErrorResponse, any>({
        path: `/v1/streams/${stream}${stop}`,
        method: "PUT",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name FilesInfoDetail
     * @summary Inspect file metadata
     * @request GET:/v1/files/{path}:info
     * @secure
     */
    filesInfoDetail: (path: string, info: string, params: RequestParams = {}) =>
      this.http.request<FileInfoResponse, any>({
        path: `/v1/files/${path}${info}`,
        method: "GET",
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name FilesCreateD64Update
     * @summary Create D64 image
     * @request PUT:/v1/files/{path}:create_d64
     * @secure
     */
    filesCreateD64Update: (
      path: string,
      createD64: string,
      query?: {
        tracks?: 35 | 40;
        diskname?: string;
      },
      params: RequestParams = {},
    ) =>
      this.http.request<ErrorResponse, any>({
        path: `/v1/files/${path}${createD64}`,
        method: "PUT",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name FilesCreateD71Update
     * @summary Create D71 image
     * @request PUT:/v1/files/{path}:create_d71
     * @secure
     */
    filesCreateD71Update: (
      path: string,
      createD71: string,
      query?: {
        diskname?: string;
      },
      params: RequestParams = {},
    ) =>
      this.http.request<ErrorResponse, any>({
        path: `/v1/files/${path}${createD71}`,
        method: "PUT",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name FilesCreateD81Update
     * @summary Create D81 image
     * @request PUT:/v1/files/{path}:create_d81
     * @secure
     */
    filesCreateD81Update: (
      path: string,
      createD81: string,
      query?: {
        diskname?: string;
      },
      params: RequestParams = {},
    ) =>
      this.http.request<ErrorResponse, any>({
        path: `/v1/files/${path}${createD81}`,
        method: "PUT",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),

    /**
     * No description
     *
     * @name FilesCreateDnpUpdate
     * @summary Create DNP image
     * @request PUT:/v1/files/{path}:create_dnp
     * @secure
     */
    filesCreateDnpUpdate: (
      path: string,
      createDnp: string,
      query: {
        /**
         * @min 1
         * @max 255
         */
        tracks: number;
        diskname?: string;
      },
      params: RequestParams = {},
    ) =>
      this.http.request<ErrorResponse, any>({
        path: `/v1/files/${path}${createDnp}`,
        method: "PUT",
        query: query,
        secure: true,
        format: "json",
        ...params,
      }),
  };
}
