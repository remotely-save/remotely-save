//////////////////////////////////////////////
// all types
// https://yandex.com/dev/disk-api/doc/en/reference/response-objects
//////////////////////////////////////////////

export interface Link {
  href: string;
  method: string;
  templated: boolean;
}

export interface Resource {
  antivirus_status?: string;
  public_key?: string;
  _embedded?: ResourceList;
  name?: string;
  created?: string;
  custom_properties?: Record<string, string>;
  public_url?: string;
  origin_path?: string;
  modified?: string;
  path?: string;
  md5?: string;
  sha256?: string;
  file?: string;
  type?: "dir" | "file";
  mime_type?: string;
  size?: number;
  exif?: Record<any, any>;
}

type SortType = string;

export interface ResourceList {
  sort?: SortType;
  public_key?: string;
  items?: Resource[];
  path?: string;
  limit?: number;
  offset?: number;
  total?: number;
}

export interface FilesResourceList {
  items: Resource[];
  limit: number;
  offset: number;
}

export interface LastUploadedResourceList {
  items: Resource[];
  limit: number;
}

export interface PublicResourcesList {
  items: Resource[];
  type: "dir" | "file";
  limit: number;
  offset: number;
}

export interface Disk {
  trash_size: number;
  total_space: number;
  used_space: number;
  system_folders: {
    applications: string;
    downloads: string;
  };
}

export interface Operation {
  status: "success" | "failed" | "in-progress";
}

export interface ErrorResponse {
  error: string;
  description: string;
  message?: string;
}

//////////////////////////////////////////////
// api
// https://yandex.com/dev/disk-api/doc/en/
//////////////////////////////////////////////

export class YandexApi {
  accessToken: string;
  apiVersion: number;
  host: string;
  constructor(accessToken: string) {
    this.accessToken = accessToken;
    this.apiVersion = 1;
    this.host = `https://cloud-api.yandex.net`;
  }

  async _api(
    method: string,
    endPoint: string,
    returnType: "json" | "arrayBuffer" | "raw",
    queryParams?: Record<string, string>,
    body?: any,
    requestContentType?: string
  ) {
    let p = "";
    if (queryParams !== undefined) {
      p = `?${new URLSearchParams(queryParams)}`;
    }

    const fullUrl = `${this.host}/v${this.apiVersion}/${endPoint}${p}`;
    // console.debug(`method: ${method}, fullUrl: ${fullUrl}`)
    const headers: HeadersInit = {
      Authorization: `OAuth ${this.accessToken}`,
    };
    if (requestContentType !== undefined) {
      headers["Content-Type"] = requestContentType;
    }
    const r = await fetch(fullUrl, {
      method: method,
      headers: headers,
      body: body,
    });
    // console.debug(r)

    if (r.status >= 200 && r.status < 300) {
      if (returnType === "json") {
        return await r.json();
      }
      if (returnType === "arrayBuffer") {
        return await r.arrayBuffer();
      }
      if (returnType === "raw") {
        return r;
      }
    } else {
      throw Error(JSON.stringify((await r.json()) as ErrorResponse));
    }
  }

  async disk() {
    return (await this._api("GET", "disk/", "json")) as Disk;
  }

  async diskResources(
    path: string,
    fields?: string[],
    limit?: number,
    offset?: number
  ) {
    const params: Record<string, string> = {
      path: path,
    };
    if (fields !== undefined) {
      params["fields"] = fields.join(",");
    }
    if (limit !== undefined) {
      params["limit"] = `${limit}`;
    }
    if (offset !== undefined) {
      params["offset"] = `${offset}`;
    }

    return (await this._api(
      "GET",
      "disk/resources",
      "json",
      params
    )) as Resource;
  }

  async diskResourcesFiles(fields?: string[], limit?: number, offset?: number) {
    const params: Record<string, string> = {};
    if (fields !== undefined) {
      params["fields"] = fields.join(",");
    }
    if (limit !== undefined) {
      params["limit"] = `${limit}`;
    }
    if (offset !== undefined) {
      params["offset"] = `${offset}`;
    }
    return (await this._api(
      "GET",
      "disk/resources/files",
      "json",
      params
    )) as FilesResourceList;
  }

  async diskResourcesPatch(
    path: string,
    custom_properties: Record<string, string | null>,
    fields?: string[]
  ) {
    const params: Record<string, string> = {
      path: path,
    };
    if (fields !== undefined) {
      params["fields"] = fields.join(",");
    }
    return (await this._api(
      "PATCH",
      "disk/resources",
      "json",
      params,
      JSON.stringify({
        custom_properties: custom_properties,
      }),
      "application/json"
    )) as Resource;
  }

  async diskResoucesUpload(
    path: string,
    content: ArrayBuffer,
    overwrite?: boolean
  ) {
    const params: Record<string, string> = {
      path: path,
      overwrite: `${overwrite ?? false}`,
    };
    const link = (await this._api(
      "GET",
      "disk/resources/upload",
      "json",
      params
    )) as Link;

    if (link.templated) {
      throw Error(
        `do not know how to deal with upload link with templated: ${JSON.stringify(
          link
        )}`
      );
    }

    const rsp = await fetch(link.href, {
      method: link.method,
      body: content,
    });
    if (rsp.status === 200 || rsp.status === 201 || rsp.status === 202) {
      return true;
    } else {
      throw Error(`upload failed. status=${rsp.status}, link=${link.href}`);
    }
  }

  async diskResoucesDownload(path: string) {
    const params: Record<string, string> = {
      path: path,
    };
    const link = (await this._api(
      "GET",
      "disk/resources/download",
      "json",
      params
    )) as Link;

    if (link.templated) {
      throw Error(
        `do not know how to deal with download link with templated: ${JSON.stringify(
          link
        )}`
      );
    }

    const rsp = await fetch(link.href, {
      method: link.method,
    });
    if (rsp.status === 200 || rsp.status === 201 || rsp.status === 202) {
      return await rsp.arrayBuffer();
    } else {
      throw Error(`download failed. status=${rsp.status}, link=${link.href}`);
    }
  }

  async diskResourcesDelete(path: string, permanently?: boolean) {
    const params: Record<string, string> = {
      path: path,
      permanently: `${permanently ?? false}`,
    };
    const rsp = (await this._api(
      "DELETE",
      "disk/resources",
      "raw",
      params
    )) as Response;

    if (rsp.status === 204) {
      return;
    }
    if (rsp.status === 202) {
      return (await rsp.json()) as Link;
    }
    throw Error(`do not know how to deal with delete response ${rsp}`);
  }

  async diskResourcesPut(path: string, fields?: string[]) {
    const params: Record<string, string> = {
      path: path,
    };
    if (fields !== undefined) {
      params["fields"] = fields.join(",");
    }
    return (await this._api("PUT", "disk/resources", "json", params)) as Link;
  }
}
