const blueprints = {
  restful: {
    url: "API实际请求地址",
    home: "API的源服务地址",
    json: {
      "请求参数结构": {
        "param1": {
          "type": "string",
          "required": true,
          "description": "参数说明"
        }
      },
      "响应结构": {
        "code": {
          "type": "number",
          "description": "状态码"
        },
        "message": {
          "type": "string",
          "description": "响应信息"
        },
        "data": {
          "type": "object",
          "description": "响应数据"
        }
      },
      "接口描述": "接口功能说明",
      "请求方式": "GET"
    }
  }
};

module.exports = blueprints;